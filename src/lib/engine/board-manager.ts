// AION — Board Manager (Enhanced)
// Reads and writes the Project Board (database-backed)
// This is the SINGLE SOURCE OF TRUTH for all project state

import { db } from '@/lib/db';
import type {
  PRD,
  ExecutionPlan,
  AgentRole,
  ProjectBoardState,
  TaskAssignment,
  RepoWorkspaceSummary,
  ExecutionRunSummary,
  ApprovalRequestSummary,
  ExecutionArtifactSummary,
  WorkspaceStatus,
  RunKind,
  RunStatus,
  RiskLevel,
  ApprovalStatus,
  ApprovalType,
  ArtifactKind,
} from '@/lib/types/aion';

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
        workspaces: true,
        runs: {
          where: { status: { in: ['queued', 'awaiting_approval', 'running', 'blocked'] } },
        },
        approvals: {
          where: { status: 'pending' },
        },
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
      workspaceCount: project.workspaces.length,
      activeRunCount: project.runs.length,
      pendingApprovalCount: project.approvals.length,
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
        testResults: { orderBy: { ranAt: 'desc' }, take: 5 },
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

    // Include PRD (full for business/cto, summary for others)
    if (project.prd) {
      try {
        const prd = JSON.parse(project.prd) as PRD;
        if (agentRole === 'business' || agentRole === 'cto') {
          // Full PRD for planning agents
          parts.push(`\nPRD (FULL):`);
          parts.push(`  Problem: ${prd.problemStatement}`);
          parts.push(`  Target Users: ${prd.targetUsers}`);
          parts.push(`  MVP Features: ${prd.mvpFeatures?.join(', ') || 'Not defined'}`);
          parts.push(`  Post-MVP: ${prd.postMvpFeatures?.join(', ') || 'None'}`);
          parts.push(`  Success Criteria: ${prd.successCriteria?.join('; ') || 'Not defined'}`);
          if (prd.coreFeatures) {
            parts.push(`  Core Features:`);
            prd.coreFeatures.forEach(f => {
              parts.push(`    - ${f.name} (${f.priority}): ${f.description}`);
            });
          }
        } else {
          // Summary for builder agents
          parts.push(`\nPRD SUMMARY: ${prd.summary || 'No summary'}`);
          parts.push(`MVP FEATURES: ${prd.mvpFeatures?.join(', ') || 'Not defined'}`);
          parts.push(`TARGET USERS: ${prd.targetUsers || 'Not defined'}`);
        }
      } catch {
        parts.push(`\nPRD: Error parsing PRD`);
      }
    } else {
      parts.push(`\nPRD: Not yet created`);
    }

    // Include execution plan for builder agents
    if (project.executionPlan) {
      try {
        const plan = JSON.parse(project.executionPlan) as ExecutionPlan;
        parts.push(`\nEXECUTION PLAN: ${plan.approach || 'In progress'}`);
      } catch {}
    }

    // Include relevant completed tasks
    if (completedTasks.length > 0) {
      parts.push(`\nCOMPLETED TASKS (${completedTasks.length}):`);
      completedTasks.slice(-15).forEach(t => {
        parts.push(`  - [${t.assignedTo}] ${t.description} ✅`);
      });
    }

    // Include pending tasks (most important for current agent)
    if (pendingTasks.length > 0) {
      parts.push(`\nPENDING TASKS (${pendingTasks.length}):`);
      pendingTasks.forEach(t => {
        const isMyTask = t.assignedTo === agentRole;
        parts.push(`  - [${t.assignedTo}] ${t.description} ${isMyTask ? '← YOUR TASK' : ''}`);
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
        const isMyBug = b.assignedTo === agentRole;
        parts.push(`  - [${b.severity}] ${b.description} ${b.filePath ? `(${b.filePath})` : ''} ${isMyBug ? '← FIX THIS' : ''}`);
      });
    }

    // Include file manifest — crucial for code generation
    if (project.files.length > 0) {
      parts.push(`\nFILES IN PROJECT (${project.files.length}):`);
      // Show file paths grouped by agent
      const byAgent: Record<string, string[]> = {};
      project.files.forEach(f => {
        if (!byAgent[f.createdBy]) byAgent[f.createdBy] = [];
        byAgent[f.createdBy].push(f.path);
      });
      for (const [agent, paths] of Object.entries(byAgent)) {
        parts.push(`  [${agent}]:`);
        paths.forEach(p => parts.push(`    - ${p}`));
      }
    }

    // Include test results
    if (project.testResults.length > 0) {
      parts.push(`\nTEST RESULTS:`);
      project.testResults.forEach(tr => {
        parts.push(`  - ${tr.testType}: ${tr.passed ? '✅ PASS' : '❌ FAIL'} ${tr.details ? `— ${tr.details.substring(0, 100)}` : ''}`);
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
   * Get next pending task for an agent
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
   * Get all pending tasks for a project
   */
  async getPendingTasks(projectId: string) {
    return db.task.findMany({
      where: { projectId, status: 'pending' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get next pending task and mark it as in_progress
   */
  async claimNextTask(projectId: string, agentRole: AgentRole) {
    const task = await this.getNextPendingTask(projectId, agentRole);
    if (task) {
      await this.updateTaskStatus(task.id, 'in_progress');
    }
    return task;
  }

  /**
   * Write files to the project (database)
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
   * Resolve a bug
   */
  async resolveBug(bugId: string): Promise<void> {
    await db.bug.update({
      where: { id: bugId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
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
   * Create a deployment record
   */
  async createDeployment(projectId: string, data: {
    platform?: string;
    status?: string;
    url?: string;
    githubRepo?: string;
    errors?: string;
  }): Promise<string> {
    const deployment = await db.deployment.create({
      data: {
        projectId,
        platform: data.platform || 'render',
        status: data.status || 'pending',
        url: data.url,
        githubRepo: data.githubRepo,
        errors: data.errors,
      },
    });
    return deployment.id;
  }

  /**
   * Update deployment
   */
  async updateDeployment(deploymentId: string, data: {
    status?: string;
    url?: string;
    errors?: string;
    deployedAt?: Date;
  }): Promise<void> {
    await db.deployment.update({
      where: { id: deploymentId },
      data,
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
        workspaces: {
          orderBy: { updatedAt: 'desc' },
        },
        approvals: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
        },
        runs: {
          where: { status: { in: ['queued', 'awaiting_approval', 'running', 'blocked'] } },
          orderBy: { createdAt: 'desc' },
        },
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
        bugs: { orderBy: { id: 'desc' } },
        testResults: { orderBy: { id: 'desc' } },
        agentLogs: { orderBy: { id: 'desc' }, take: 50 },
        deployments: { orderBy: { id: 'desc' } },
        workspaces: { orderBy: { updatedAt: 'desc' } },
        runs: { orderBy: { createdAt: 'desc' }, take: 50 },
        approvals: { orderBy: { createdAt: 'desc' }, take: 50 },
        artifacts: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
  }

  /**
   * Update project live URL
   */
  async updateLiveUrl(projectId: string, url: string): Promise<void> {
    await db.project.update({
      where: { id: projectId },
      data: { liveUrl: url },
    });
  }

  /**
   * Update project GitHub repo
   */
  async updateGithubRepo(projectId: string, repo: string): Promise<void> {
    await db.project.update({
      where: { id: projectId },
      data: { githubRepo: repo },
    });
  }

  // ============================================================
  // WORKSPACES / RUNS / APPROVALS / ARTIFACTS
  // ============================================================

  async createWorkspace(projectId: string, input: {
    name: string;
    slug: string;
    repoUrl?: string;
    repoProvider?: string;
    defaultBranch?: string;
    currentBranch?: string;
    rootPath?: string;
    status?: WorkspaceStatus;
    isPrimary?: boolean;
  }): Promise<string> {
    const workspace = await db.repoWorkspace.create({
      data: {
        projectId,
        name: input.name,
        slug: input.slug,
        repoUrl: input.repoUrl,
        repoProvider: input.repoProvider,
        defaultBranch: input.defaultBranch ?? 'main',
        currentBranch: input.currentBranch ?? input.defaultBranch ?? 'main',
        rootPath: input.rootPath,
        status: input.status ?? 'inactive',
        isPrimary: input.isPrimary ?? false,
      },
    });

    return workspace.id;
  }

  async listWorkspaces(projectId: string): Promise<RepoWorkspaceSummary[]> {
    const workspaces = await db.repoWorkspace.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });

    return workspaces.map(workspace => ({
      id: workspace.id,
      projectId: workspace.projectId,
      name: workspace.name,
      slug: workspace.slug,
      repoUrl: workspace.repoUrl,
      repoProvider: workspace.repoProvider,
      defaultBranch: workspace.defaultBranch,
      currentBranch: workspace.currentBranch,
      rootPath: workspace.rootPath,
      status: workspace.status as WorkspaceStatus,
      isPrimary: workspace.isPrimary,
      lastSyncedAt: workspace.lastSyncedAt?.toISOString() ?? null,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    }));
  }

  async getWorkspace(workspaceId: string): Promise<RepoWorkspaceSummary | null> {
    const workspace = await db.repoWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return null;

    return {
      id: workspace.id,
      projectId: workspace.projectId,
      name: workspace.name,
      slug: workspace.slug,
      repoUrl: workspace.repoUrl,
      repoProvider: workspace.repoProvider,
      defaultBranch: workspace.defaultBranch,
      currentBranch: workspace.currentBranch,
      rootPath: workspace.rootPath,
      status: workspace.status as WorkspaceStatus,
      isPrimary: workspace.isPrimary,
      lastSyncedAt: workspace.lastSyncedAt?.toISOString() ?? null,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    };
  }

  async getPrimaryWorkspace(projectId: string): Promise<RepoWorkspaceSummary | null> {
    const workspace = await db.repoWorkspace.findFirst({
      where: { projectId, isPrimary: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!workspace) return null;

    return {
      id: workspace.id,
      projectId: workspace.projectId,
      name: workspace.name,
      slug: workspace.slug,
      repoUrl: workspace.repoUrl,
      repoProvider: workspace.repoProvider,
      defaultBranch: workspace.defaultBranch,
      currentBranch: workspace.currentBranch,
      rootPath: workspace.rootPath,
      status: workspace.status as WorkspaceStatus,
      isPrimary: workspace.isPrimary,
      lastSyncedAt: workspace.lastSyncedAt?.toISOString() ?? null,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    };
  }

  async updateWorkspace(workspaceId: string, data: {
    name?: string;
    repoUrl?: string | null;
    repoProvider?: string | null;
    defaultBranch?: string | null;
    currentBranch?: string | null;
    rootPath?: string | null;
    status?: WorkspaceStatus;
    isPrimary?: boolean;
    lastSyncedAt?: Date | null;
  }): Promise<void> {
    await db.repoWorkspace.update({
      where: { id: workspaceId },
      data,
    });
  }

  async createRun(projectId: string, input: {
    workspaceId?: string;
    agentRole?: AgentRole;
    kind: RunKind;
    status?: RunStatus;
    summary: string;
    command?: string;
    requestedBy?: string;
    approvalRequired?: boolean;
  }): Promise<string> {
    const run = await db.executionRun.create({
      data: {
        projectId,
        workspaceId: input.workspaceId,
        agentRole: input.agentRole,
        kind: input.kind,
        status: input.status ?? 'queued',
        summary: input.summary,
        command: input.command,
        requestedBy: input.requestedBy,
        approvalRequired: input.approvalRequired ?? false,
      },
    });

    return run.id;
  }

  async updateRun(runId: string, data: {
    status?: RunStatus;
    summary?: string;
    command?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    output?: string | null;
    error?: string | null;
  }): Promise<void> {
    await db.executionRun.update({
      where: { id: runId },
      data,
    });
  }

  async listRuns(projectId: string, workspaceId?: string): Promise<ExecutionRunSummary[]> {
    const runs = await db.executionRun.findMany({
      where: {
        projectId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return runs.map(run => ({
      id: run.id,
      projectId: run.projectId,
      workspaceId: run.workspaceId ?? null,
      agentRole: run.agentRole as AgentRole | undefined,
      kind: run.kind as RunKind,
      status: run.status as RunStatus,
      summary: run.summary,
      command: run.command,
      requestedBy: run.requestedBy,
      approvalRequired: run.approvalRequired,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      output: run.output,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    }));
  }

  async getRun(runId: string): Promise<ExecutionRunSummary | null> {
    const run = await db.executionRun.findUnique({
      where: { id: runId },
    });

    if (!run) return null;

    return {
      id: run.id,
      projectId: run.projectId,
      workspaceId: run.workspaceId ?? null,
      agentRole: run.agentRole as AgentRole | undefined,
      kind: run.kind as RunKind,
      status: run.status as RunStatus,
      summary: run.summary,
      command: run.command,
      requestedBy: run.requestedBy,
      approvalRequired: run.approvalRequired,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      output: run.output,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  async claimNextQueuedRun(): Promise<ExecutionRunSummary | null> {
    const run = await db.executionRun.findFirst({
      where: {
        status: 'queued',
        approvalRequired: false,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!run) return null;

    const claimed = await db.executionRun.update({
      where: { id: run.id },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    return {
      id: claimed.id,
      projectId: claimed.projectId,
      workspaceId: claimed.workspaceId ?? null,
      agentRole: claimed.agentRole as AgentRole | undefined,
      kind: claimed.kind as RunKind,
      status: claimed.status as RunStatus,
      summary: claimed.summary,
      command: claimed.command,
      requestedBy: claimed.requestedBy,
      approvalRequired: claimed.approvalRequired,
      startedAt: claimed.startedAt?.toISOString() ?? null,
      completedAt: claimed.completedAt?.toISOString() ?? null,
      output: claimed.output,
      error: claimed.error,
      createdAt: claimed.createdAt.toISOString(),
      updatedAt: claimed.updatedAt.toISOString(),
    };
  }

  async createApprovalRequest(projectId: string, input: {
    workspaceId?: string;
    runId?: string;
    type: ApprovalType;
    riskLevel?: RiskLevel;
    summary: string;
    commandPreview?: string;
    diffSummary?: string;
    requestedBy?: string;
  }): Promise<string> {
    const approval = await db.approvalRequest.create({
      data: {
        projectId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        type: input.type,
        riskLevel: input.riskLevel ?? 'medium',
        summary: input.summary,
        commandPreview: input.commandPreview,
        diffSummary: input.diffSummary,
        requestedBy: input.requestedBy,
      },
    });

    return approval.id;
  }

  async updateApprovalRequest(approvalId: string, data: {
    status?: ApprovalStatus;
    decidedBy?: string | null;
    decisionReason?: string | null;
    decidedAt?: Date | null;
    commandPreview?: string | null;
    diffSummary?: string | null;
  }): Promise<void> {
    await db.approvalRequest.update({
      where: { id: approvalId },
      data,
    });
  }

  async listApprovalRequests(projectId: string, workspaceId?: string): Promise<ApprovalRequestSummary[]> {
    const approvals = await db.approvalRequest.findMany({
      where: {
        projectId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return approvals.map(approval => ({
      id: approval.id,
      projectId: approval.projectId,
      workspaceId: approval.workspaceId ?? null,
      runId: approval.runId ?? null,
      type: approval.type as ApprovalType,
      riskLevel: approval.riskLevel as RiskLevel,
      status: approval.status as ApprovalStatus,
      summary: approval.summary,
      commandPreview: approval.commandPreview,
      diffSummary: approval.diffSummary,
      requestedBy: approval.requestedBy,
      decidedBy: approval.decidedBy,
      decisionReason: approval.decisionReason,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
      updatedAt: approval.updatedAt.toISOString(),
    }));
  }

  async createArtifact(projectId: string, input: {
    workspaceId?: string;
    runId?: string;
    kind: ArtifactKind;
    title: string;
    path?: string;
    contentType?: string;
    content?: string;
    metadata?: string;
    sizeBytes?: number;
  }): Promise<string> {
    const artifact = await db.executionArtifact.create({
      data: {
        projectId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        kind: input.kind,
        title: input.title,
        path: input.path,
        contentType: input.contentType,
        content: input.content,
        metadata: input.metadata,
        sizeBytes: input.sizeBytes,
      },
    });

    return artifact.id;
  }

  async listArtifacts(projectId: string, workspaceId?: string, runId?: string): Promise<ExecutionArtifactSummary[]> {
    const artifacts = await db.executionArtifact.findMany({
      where: {
        projectId,
        ...(workspaceId ? { workspaceId } : {}),
        ...(runId ? { runId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return artifacts.map(artifact => ({
      id: artifact.id,
      projectId: artifact.projectId,
      workspaceId: artifact.workspaceId ?? null,
      runId: artifact.runId ?? null,
      kind: artifact.kind as ArtifactKind,
      title: artifact.title,
      path: artifact.path,
      contentType: artifact.contentType,
      content: artifact.content,
      metadata: artifact.metadata,
      sizeBytes: artifact.sizeBytes,
      createdAt: artifact.createdAt.toISOString(),
    }));
  }

  // ============================================================
  // CONVERSATION MANAGEMENT
  // ============================================================

  /**
   * Save a conversation message to the database
   */
  async saveConversationMessage(projectId: string, message: {
    role: string;
    content: string;
    agentRole?: string;
    metadata?: any;
  }): Promise<string> {
    const record = await db.conversationMessage.create({
      data: {
        projectId,
        role: message.role,
        content: message.content,
        agentRole: message.agentRole,
        metadata: message.metadata ? JSON.stringify(message.metadata) : undefined,
      },
    });
    return record.id;
  }

  /**
   * Get conversation history for a project
   * Returns the last N messages for context building
   */
  async getConversationHistory(projectId: string, limit: number = 50): Promise<{
    id: string;
    role: string;
    content: string;
    agentRole: string | null;
    metadata: string | null;
    createdAt: Date;
  }[]> {
    return db.conversationMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Build a conversation history string for the CTO agent
   * This is used to give the CTO context of what was discussed
   */
  async buildConversationContext(projectId: string, limit: number = 20): Promise<string> {
    const messages = await this.getConversationHistory(projectId, limit);

    if (messages.length === 0) {
      return 'No previous conversation.';
    }

    return messages.map(msg => {
      const role = msg.role === 'user' ? 'USER' : msg.role === 'cto' ? 'CTO (You)' : 'SYSTEM';
      const prefix = msg.agentRole && msg.role !== 'user' && msg.role !== 'cto'
        ? `[${msg.agentRole.toUpperCase()}]`
        : '';
      return `${role}${prefix ? ' ' + prefix : ''}: ${msg.content}`;
    }).join('\n\n');
  }
}

// Singleton
export const boardManager = new BoardManager();
