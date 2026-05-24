// AION — Board Manager
// Reads and writes the Project Board (database-backed)
// This is the SINGLE SOURCE OF TRUTH for all project state

import { db } from '@/lib/db';
import type { PRD, ExecutionPlan, AgentRole, ProjectBoardState } from '@/lib/types/aion';

export class BoardManager {
  /**
   * Create a new project in the database
   */
  async createProject(name: string, description: string): Promise<string> {
    const project = await db.project.create({
      data: {
        name,
        description,
        status: 'planning',
      },
    });
    return project.id;
  }

  /**
   * Get the full project board state for a project
   */
  async getProjectState(projectId: string): Promise<ProjectBoardState | null> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        files: true,
        bugs: true,
        testResults: true,
        agentLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        deployments: true,
      },
    });

    if (!project) return null;

    const completedTasks = project.tasks.filter(t => t.status === 'done');
    const pendingTasks = project.tasks.filter(t => t.status === 'pending');
    const openBugs = project.bugs.filter(b => b.status === 'open');

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status as ProjectBoardState['status'],
      prd: project.prd ? JSON.parse(project.prd) : null,
      executionPlan: project.executionPlan ? JSON.parse(project.executionPlan) : null,
      completedTaskCount: completedTasks.length,
      pendingTaskCount: pendingTasks.length,
      openBugCount: openBugs.length,
      fileCount: project.files.length,
      buildStatus: (project.deployments[0]?.status as any) || 'never',
      deployStatus: (project.deployments[0]?.status as any) || 'never',
      liveUrl: project.liveUrl,
      totalCycles: project.totalCycles,
      lastActivityAt: project.updatedAt.toISOString(),
    };
  }

  /**
   * Build a context string for an agent from the project board
   * This is LAYER 2 of the memory system — built fresh every turn
   */
  async buildAgentContext(projectId: string, agentRole: AgentRole): Promise<string> {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: { orderBy: { createdAt: 'asc' } },
        files: true,
        bugs: { where: { status: 'open' } },
        agentLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!project) return 'ERROR: Project not found';

    const completedTasks = project.tasks.filter(t => t.status === 'done');
    const pendingTasks = project.tasks.filter(t => t.status === 'pending');
    const inProgressTasks = project.tasks.filter(t => t.status === 'in_progress');

    // Smart context: only include what this agent needs
    const parts: string[] = [];

    // Always include: project identity
    parts.push(`PROJECT: ${project.name}`);
    parts.push(`STATUS: ${project.status}`);
    parts.push(`DESCRIPTION: ${project.description}`);

    // Include PRD summary (not full PRD — too long)
    if (project.prd) {
      try {
        const prd = JSON.parse(project.prd) as PRD;
        parts.push(`\nPRD SUMMARY: ${prd.summary || 'No summary'}`);
        parts.push(`MVP FEATURES: ${prd.mvpFeatures?.join(', ') || 'Not defined'}`);
        parts.push(`TARGET USERS: ${prd.targetUsers || 'Not defined'}`);
      } catch {
        parts.push(`\nPRD: Error parsing PRD`);
      }
    } else {
      parts.push(`\nPRD: Not yet created`);
    }

    // Include relevant completed tasks
    if (completedTasks.length > 0) {
      parts.push(`\nCOMPLETED TASKS (${completedTasks.length}):`);
      completedTasks.slice(-10).forEach(t => {
        parts.push(`  - [${t.assignedTo}] ${t.description} ${t.status === 'done' ? '✅' : ''}`);
      });
    }

    // Include pending tasks
    if (pendingTasks.length > 0) {
      parts.push(`\nPENDING TASKS (${pendingTasks.length}):`);
      pendingTasks.forEach(t => {
        parts.push(`  - [${t.assignedTo}] ${t.description}`);
      });
    }

    // Include in-progress tasks
    if (inProgressTasks.length > 0) {
      parts.push(`\nIN PROGRESS:`);
      inProgressTasks.forEach(t => {
        parts.push(`  - [${t.assignedTo}] ${t.description} (retry: ${t.retryCount}/${t.maxRetries})`);
      });
    }

    // Include open bugs
    if (project.bugs.length > 0) {
      parts.push(`\nOPEN BUGS (${project.bugs.length}):`);
      project.bugs.forEach(b => {
        parts.push(`  - [${b.severity}] ${b.description} ${b.filePath ? `(${b.filePath})` : ''}`);
      });
    }

    // Include file manifest
    if (project.files.length > 0) {
      parts.push(`\nFILES CREATED (${project.files.length}):`);
      project.files.forEach(f => {
        parts.push(`  - ${f.path} (by ${f.createdBy})`);
      });
    }

    // Include recent agent activity
    if (project.agentLogs.length > 0) {
      parts.push(`\nRECENT ACTIVITY:`);
      project.agentLogs.slice(0, 5).forEach(log => {
        parts.push(`  - [${log.agentRole}] ${log.action} (confidence: ${log.confidence || 'N/A'})`);
      });
    }

    // Include total cycles
    parts.push(`\nTOTAL AGENT CYCLES: ${project.totalCycles}`);

    return parts.join('\n');
  }

  /**
   * Update project PRD
   */
  async updatePRD(projectId: string, prd: PRD): Promise<void> {
    await db.project.update({
      where: { id: projectId },
      data: { prd: JSON.stringify(prd) },
    });
  }

  /**
   * Update project execution plan
   */
  async updateExecutionPlan(projectId: string, plan: ExecutionPlan): Promise<void> {
    await db.project.update({
      where: { id: projectId },
      data: { executionPlan: JSON.stringify(plan) },
    });
  }

  /**
   * Update project status
   */
  async updateStatus(projectId: string, status: string): Promise<void> {
    await db.project.update({
      where: { id: projectId },
      data: { status },
    });
  }

  /**
   * Create tasks from task assignments
   */
  async createTasks(projectId: string, assignments: {
    taskDescription: string;
    assignedTo: AgentRole;
    priority: string;
    phase: string;
  }[]): Promise<string[]> {
    const taskIds: string[] = [];
    for (const assignment of assignments) {
      const task = await db.task.create({
        data: {
          projectId,
          description: assignment.taskDescription,
          assignedTo: assignment.assignedTo,
          priority: assignment.priority,
          phase: assignment.phase,
          status: 'pending',
        },
      });
      taskIds.push(task.id);
    }
    return taskIds;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string, output?: any, feedback?: string): Promise<void> {
    const data: any = { status };
    if (output) data.output = JSON.stringify(output);
    if (feedback) data.feedback = feedback;
    if (status === 'done') data.completedAt = new Date();

    await db.task.update({
      where: { id: taskId },
      data,
    });
  }

  /**
   * Write files to the project
   */
  async writeFiles(projectId: string, files: { path: string; content: string; createdBy: string }[]): Promise<void> {
    for (const file of files) {
      // Upsert: create or update
      const existing = await db.projectFile.findFirst({
        where: { projectId, path: file.path },
      });

      if (existing) {
        await db.projectFile.update({
          where: { id: existing.id },
          data: { content: file.content, createdBy: file.createdBy },
        });
      } else {
        await db.projectFile.create({
          data: {
            projectId,
            path: file.path,
            content: file.content,
            createdBy: file.createdBy,
          },
        });
      }
    }
  }

  /**
   * Create a bug report
   */
  async createBug(projectId: string, bug: {
    description: string;
    filePath?: string;
    severity: string;
    reportedBy: string;
    assignedTo?: string;
  }): Promise<string> {
    const bugRecord = await db.bug.create({
      data: {
        projectId,
        description: bug.description,
        filePath: bug.filePath,
        severity: bug.severity,
        status: 'open',
        reportedBy: bug.reportedBy,
        assignedTo: bug.assignedTo,
      },
    });
    return bugRecord.id;
  }

  /**
   * Log agent activity
   */
  async logAgentActivity(projectId: string, log: {
    agentRole: string;
    action: string;
    task?: string;
    input?: any;
    output?: any;
    duration?: number;
    confidence?: number;
  }): Promise<void> {
    await db.agentLog.create({
      data: {
        projectId,
        agentRole: log.agentRole,
        action: log.action,
        task: log.task,
        input: log.input ? JSON.stringify(log.input) : undefined,
        output: log.output ? JSON.stringify(log.output) : undefined,
        duration: log.duration,
        confidence: log.confidence,
      },
    });

    // Increment project cycles
    await db.project.update({
      where: { id: projectId },
      data: { totalCycles: { increment: 1 } },
    });
  }

  /**
   * Get the next pending task for an agent
   */
  async getNextPendingTask(projectId: string, agentRole?: AgentRole) {
    const where: any = { projectId, status: 'pending' };
    if (agentRole) where.assignedTo = agentRole;

    return db.task.findFirst({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get all projects
   */
  async listProjects() {
    return db.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        tasks: true,
        bugs: { where: { status: 'open' } },
        _count: { select: { files: true, agentLogs: true } },
      },
    });
  }

  /**
   * Get a single project with all details
   */
  async getProject(projectId: string) {
    return db.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: { orderBy: { createdAt: 'asc' } },
        files: { orderBy: { path: 'asc' } },
        bugs: { orderBy: { createdAt: 'desc' } },
        testResults: { orderBy: { ranAt: 'desc' } },
        agentLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        deployments: { orderBy: { createdAt: 'desc' } },
      },
    });
  }
}

// Singleton
export const boardManager = new BoardManager();
