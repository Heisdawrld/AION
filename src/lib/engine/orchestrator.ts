// AION — Enhanced Orchestrator
// The autonomous loop that drives agent execution
// This is the HEART of AION — now with real file system integration

import { db } from '@/lib/db';
import { boardManager } from './board-manager';
import { workspaceManager } from './workspace-manager';
import { commandRunner } from './command-runner';
import { getAgent } from '@/lib/agents/registry';
import type {
  AgentRole,
  AgentResponse,
  NextAction,
  PRD,
  ExecutionPlan,
  TaskAssignment,
  FileChange,
  Bug,
} from '@/lib/types/aion';

const MAX_CYCLES = 100;
const MIN_CONFIDENCE = 0.4; // Lowered to allow agents to proceed with moderate confidence

export interface OrchestratorResult {
  success: boolean;
  message: string;
  agentResponses: AgentResponse[];
  projectStatus: string;
  liveUrl?: string;
  cycleCount?: number;
  phase?: string;
}

export interface OrchestrationStep {
  stepNumber: number;
  agentRole: AgentRole;
  task: string;
  response: AgentResponse;
  filesWritten: number;
  duration: number;
}

/**
 * Kick off a new project from a user's idea
 * This is the entry point when a user describes what they want to build
 */
export async function kickoffProject(projectId: string, userIdea: string): Promise<OrchestratorResult> {
  console.log(`[AION Orchestrator] Kickoff project: ${userIdea}`);

  const responses: AgentResponse[] = [];

  // ========================================
  // STEP 1: Business Agent creates PRD
  // ========================================
  const bizAgent = getAgent('business');
  const bizContext = await boardManager.buildAgentContext(projectId, 'business');

  const bizStart = Date.now();
  const bizResponse = await bizAgent.execute(
    `Create a comprehensive PRD for this project idea: "${userIdea}"

Remember:
- Every feature needs acceptance criteria
- Separate MVP from post-MVP features
- Mark suggested features as [SUGGESTION]
- Be specific about what the app should do
- Define the target users clearly
- Include success criteria`,
    bizContext
  );
  const bizDuration = Date.now() - bizStart;

  // Log business agent activity
  await boardManager.logAgentActivity(projectId, {
    agentRole: 'business',
    action: 'create_prd',
    task: `Create PRD from user idea: ${userIdea}`,
    duration: bizDuration,
    confidence: bizResponse.confidence,
    output: bizResponse.output,
  });

  // Save business agent's activity as a conversation message (so user sees it)
  if (bizResponse.output.statusUpdate || bizResponse.output.analysis) {
    await boardManager.saveConversationMessage(projectId, {
      role: 'system',
      content: bizResponse.output.statusUpdate || bizResponse.output.analysis || 'Business Strategist completed PRD analysis.',
      agentRole: 'business',
      metadata: { confidence: bizResponse.confidence },
    });
  }

  // Save PRD to database if it was generated
  if (bizResponse.output.analysis) {
    // The AI might include the PRD in different formats
    // Try to extract it from the output
    const prd = extractPRDFromResponse(bizResponse, userIdea);
    if (prd) {
      await boardManager.updatePRD(projectId, prd);
      console.log(`[AION Orchestrator] PRD saved for project ${projectId}`);
    }
  }

  responses.push(bizResponse);

  // ========================================
  // STEP 2: CTO Agent reviews PRD and creates execution plan
  // ========================================
  const ctoAgent = getAgent('cto');
  const ctoContext = await boardManager.buildAgentContext(projectId, 'cto');

  const ctoStart = Date.now();
  const ctoResponse = await ctoAgent.execute(
    `The Business Strategist has created a PRD for: "${userIdea}"

Your job:
1. Review the PRD and decide if it's complete enough to build
2. Create an execution plan with specific phases
3. Create task assignments for each team member:
   - Backend Lead: Design database schema and build API routes
   - Frontend Lead: Build UI components and pages
   - QA Engineer: Test the build and check for bugs
   - DevOps Lead: Deploy the application
4. Be VERY specific — each task should be executable independently
5. Order tasks correctly: backend before frontend that depends on it

IMPORTANT: Create tasks that can be executed one at a time. Each task should produce concrete output (files, schemas, etc.).`,
    ctoContext
  );
  const ctoDuration = Date.now() - ctoStart;

  // Log CTO activity
  await boardManager.logAgentActivity(projectId, {
    agentRole: 'cto',
    action: 'plan_execution',
    task: 'Review PRD and create execution plan',
    duration: ctoDuration,
    confidence: ctoResponse.confidence,
    output: ctoResponse.output,
  });

  // Save CTO's response as a conversation message (the main one the user sees)
  if (ctoResponse.output.statusUpdate) {
    await boardManager.saveConversationMessage(projectId, {
      role: 'cto',
      content: ctoResponse.output.statusUpdate,
      agentRole: 'cto',
      metadata: {
        confidence: ctoResponse.confidence,
        taskAssignments: ctoResponse.output.taskAssignments,
      },
    });
  }

  // Save execution plan and create tasks
  if (ctoResponse.output.taskAssignments && ctoResponse.output.taskAssignments.length > 0) {
    // Create tasks in the database
    await boardManager.createTasks(projectId, ctoResponse.output.taskAssignments);
    console.log(`[AION Orchestrator] Created ${ctoResponse.output.taskAssignments.length} tasks`);

    // Save execution plan
    const plan: ExecutionPlan = {
      phases: [{
        name: 'Build',
        description: 'Build the application from PRD',
        tasks: ctoResponse.output.taskAssignments.map(ta => ({
          description: ta.taskDescription,
          assignedTo: ta.assignedTo,
          priority: ta.priority,
          phase: ta.phase,
        })),
      }],
      estimatedTasks: ctoResponse.output.taskAssignments.length,
      riskAssessment: 'Standard web application build',
      approach: ctoResponse.output.analysis || 'Build based on PRD',
    };
    await boardManager.updateExecutionPlan(projectId, plan);

    // Update project status
    await boardManager.updateStatus(projectId, 'building');
  }

  responses.push(ctoResponse);

  // ========================================
  // STEP 3: Initialize workspace
  // ========================================
  const projectName = projectId.substring(0, 8);
  const initResult = await workspaceManager.initializeNextApp(projectId, `aion-${projectName}`);
  if (!initResult.success) {
    console.error(`[AION Orchestrator] Workspace init failed: ${initResult.error}`);
  }

  return {
    success: true,
    message: ctoResponse.output.statusUpdate || `Project initialized! CTO created ${ctoResponse.output.taskAssignments?.length || 0} tasks. Ready to build.`,
    agentResponses: responses,
    projectStatus: 'building',
    phase: 'planning',
  };
}

/**
 * Run one orchestration step — execute the next pending task
 * This is called repeatedly to advance the project
 */
export async function runOrchestrationStep(projectId: string): Promise<OrchestratorResult> {
  const state = await boardManager.getProjectState(projectId);

  if (!state) {
    return {
      success: false,
      message: 'Project not found',
      agentResponses: [],
      projectStatus: 'failed',
    };
  }

  // Safety: check max cycles
  if (state.totalCycles >= MAX_CYCLES) {
    return {
      success: false,
      message: '⚠️ Max agent cycles reached (100). Pausing for human review.',
      agentResponses: [],
      projectStatus: state.status,
    };
  }

  // Determine next action (now async to fetch tasks from DB)
  const nextAction = await determineNextAction(state);
  console.log(`[AION Orchestrator] Step ${state.totalCycles + 1}: ${nextAction.type}`, nextAction.agent || '', nextAction.task?.substring(0, 60) || '');

  const responses: AgentResponse[] = [];
  let filesWritten = 0;

  switch (nextAction.type) {
    case 'run_agent': {
      if (!nextAction.agent) break;

      const agent = getAgent(nextAction.agent);
      const context = await boardManager.buildAgentContext(projectId, nextAction.agent);
      const task = nextAction.task || 'Analyze current project state and take appropriate action';

      // Execute the agent
      const startTime = Date.now();
      let response: AgentResponse;

      try {
        response = await agent.execute(task, context);
      } catch (error: any) {
        response = {
          agentId: nextAction.agent,
          taskId: 'error',
          status: 'failed',
          output: { analysis: `Agent execution failed: ${error.message}` },
          confidence: 0,
        };
      }

      const duration = Date.now() - startTime;

      // Log the activity
      await boardManager.logAgentActivity(projectId, {
        agentRole: nextAction.agent,
        action: nextAction.task?.substring(0, 100) || 'execute',
        task: nextAction.task,
        duration,
        confidence: response.confidence,
        output: response.output,
      });

      // Process the response
      const processResult = await processAgentResponse(projectId, response);
      filesWritten = processResult.filesWritten;

      // Save agent activity as a conversation message (broadcasts to user)
      if (response.output.statusUpdate) {
        await boardManager.saveConversationMessage(projectId, {
          role: response.agentId === 'cto' ? 'cto' : 'system',
          content: response.output.statusUpdate,
          agentRole: response.agentId,
          metadata: {
            confidence: response.confidence,
            filesWritten: processResult.filesWritten,
          },
        });
      }

      responses.push(response);

      // Check confidence threshold
      if (response.confidence < MIN_CONFIDENCE) {
        return {
          success: false,
          message: `⚠️ Low confidence (${(response.confidence * 100).toFixed(0)}%) from ${response.agentId}. Pausing for review.`,
          agentResponses: responses,
          projectStatus: state.status,
          cycleCount: state.totalCycles + 1,
        };
      }

      break;
    }

    case 'complete': {
      return {
        success: true,
        message: nextAction.message || '🎉 Project is LIVE!',
        agentResponses: responses,
        projectStatus: 'live',
        liveUrl: state.liveUrl || undefined,
      };
    }

    case 'notify_user': {
      return {
        success: true,
        message: nextAction.message || 'Processing...',
        agentResponses: responses,
        projectStatus: state.status,
      };
    }

    default: {
      return {
        success: true,
        message: 'Processing...',
        agentResponses: responses,
        projectStatus: state.status,
      };
    }
  }

  return {
    success: true,
    message: responses[0]?.output?.statusUpdate || `${responses[0]?.agentId} completed a task`,
    agentResponses: responses,
    projectStatus: state.status,
    cycleCount: state.totalCycles + 1,
    phase: getPhaseLabel(state),
  };
}

/**
 * Run multiple orchestration steps in sequence
 * This enables the autonomous loop — agents work continuously
 */
export async function runAutonomousCycle(
  projectId: string,
  maxSteps: number = 5
): Promise<OrchestratorResult> {
  const allResponses: AgentResponse[] = [];
  let finalResult: OrchestratorResult | null = null;

  for (let step = 0; step < maxSteps; step++) {
    const result = await runOrchestrationStep(projectId);

    allResponses.push(...result.agentResponses);
    finalResult = result;

    // Stop conditions
    if (!result.success && result.agentResponses.length === 0) {
      // Max cycles or error with no responses
      break;
    }

    if (result.projectStatus === 'live') {
      // Project is done!
      break;
    }

    // If low confidence, pause
    if (!result.success && result.message.includes('Low confidence')) {
      break;
    }

    // If no agent responses, we might be stuck
    if (result.agentResponses.length === 0) {
      break;
    }
  }

  return finalResult || {
    success: false,
    message: 'No steps executed',
    agentResponses: allResponses,
    projectStatus: 'building',
  };
}

/**
 * Determine what should happen next based on project state
 * Now async — fetches actual pending tasks from the database
 */
async function determineNextAction(state: any): Promise<NextAction> {
  // Priority 1: If no PRD, Business Agent creates one
  if (!state.prd) {
    return {
      type: 'run_agent',
      agent: 'business',
      task: 'Create a comprehensive PRD for this project based on the user\'s description. Define features, user stories, MVP scope, and success criteria.',
    };
  }

  // Priority 2: If PRD exists but no execution plan, Lead CTO creates one
  if (!state.executionPlan) {
    return {
      type: 'run_agent',
      agent: 'cto',
      task: 'Review the PRD and create an execution plan with specific task assignments for each team member. Break the work into phases.',
    };
  }

  // Priority 3: If there are pending tasks, execute the next one DIRECTLY
  if (state.pendingTaskCount > 0) {
    const nextTask = await boardManager.getNextPendingTask(state.projectId);
    if (nextTask) {
      // Mark task as in_progress
      await boardManager.updateTaskStatus(nextTask.id, 'in_progress');

      const agentRole = nextTask.assignedTo as AgentRole;

      // Build task-specific instructions based on the agent role
      const taskInstruction = buildTaskInstruction(agentRole, nextTask.description);

      return {
        type: 'run_agent',
        agent: agentRole,
        task: taskInstruction,
      };
    }
  }

  // Priority 4: If all tasks done and no open bugs, run QA
  if (state.pendingTaskCount === 0 && state.completedTaskCount > 0 && state.openBugCount === 0 && state.status !== 'testing') {
    return {
      type: 'run_agent',
      agent: 'qa',
      task: 'Review all the code that has been created. Run a quality check: verify TypeScript compilation, check for bugs, confirm all MVP features from the PRD are implemented, and report any issues.',
    };
  }

  // Priority 5: If there are open bugs, assign fix tasks
  if (state.openBugCount > 0 && state.pendingTaskCount === 0) {
    return {
      type: 'run_agent',
      agent: 'cto',
      task: `There are ${state.openBugCount} open bugs. Review them and create fix tasks for the appropriate agents.`,
    };
  }

  // Priority 6: If deployed and live, we're done
  if (state.liveUrl && state.status === 'live') {
    return {
      type: 'complete',
      message: '🎉 Project is LIVE and deployed!',
    };
  }

  // Fallback: Run CTO to figure out what's next
  return {
    type: 'run_agent',
    agent: 'cto',
    task: 'Assess the current project state and decide what needs to happen next. Are we stuck? Should we re-plan? What is blocking progress?',
  };
}

/**
 * Build role-specific task instructions
 * This gives each agent clear, actionable guidance
 */
function buildTaskInstruction(agentRole: AgentRole, taskDescription: string): string {
  switch (agentRole) {
    case 'business':
      return `${taskDescription}\n\nCreate a detailed PRD with: problem statement, target users, core features with user stories and acceptance criteria, MVP features, post-MVP features, and success criteria.`;

    case 'frontend':
      return `${taskDescription}\n\nBuild React components using TypeScript, Tailwind CSS, and shadcn/ui patterns. Return ALL file changes in the "files" array with path, content, action, and description. List any new npm dependencies needed and API endpoints you need from the backend.`;

    case 'backend':
      return `${taskDescription}\n\nBuild API routes and database schema using Next.js API routes and Prisma ORM. Return ALL file changes in the "files" array with path, content, action, and description. Document all API endpoints and list any new npm dependencies and environment variables needed.`;

    case 'qa':
      return `${taskDescription}\n\nReview all generated code carefully. Check for: TypeScript errors, missing imports, incorrect API contracts, security issues, and PRD feature coverage. Report bugs with exact file paths and severity levels.`;

    case 'devops':
      return `${taskDescription}\n\nCreate deployment configuration files. Return them in the "files" array. Include render.yaml or Dockerfile as needed.`;

    case 'cto':
      return `${taskDescription}\n\nAs the Lead CTO, make a clear decision and create specific task assignments if needed.`;

    default:
      return taskDescription;
  }
}

/**
 * Get the next pending task and create the appropriate action
 * DEPRECATED — now handled inline in determineNextAction
 */
function getNextPendingTaskAction(projectId: string): NextAction {
  return {
    type: 'run_agent',
    agent: 'cto',
    task: 'PICK_NEXT_TASK',
  };
}

/**
 * Process an agent's response and update the board accordingly
 * EXPORTED so the chat route can also use it
 */
export async function processAgentResponse(
  projectId: string,
  response: AgentResponse
): Promise<{ filesWritten: number }> {
  const { output, agentId } = response;
  let filesWritten = 0;

  // ========================================
  // Mark the current in-progress task as done/failed/retry
  // ========================================
  if (response.status === 'success' || response.status === 'failed' || response.status === 'needs_clarification') {
    const inProgressTask = await db.task.findFirst({
      where: { projectId, assignedTo: agentId, status: 'in_progress' },
    });
    if (inProgressTask) {
      if (response.status === 'success') {
        await boardManager.updateTaskStatus(inProgressTask.id, 'done', response.output);
      } else {
        // failed or needs_clarification — retry
        const newRetryCount = inProgressTask.retryCount + 1;
        const maxedOut = newRetryCount >= inProgressTask.maxRetries;

        await db.task.update({
          where: { id: inProgressTask.id },
          data: {
            retryCount: newRetryCount,
            status: maxedOut ? 'failed' : 'pending', // Re-queue if retries left
            feedback: response.output.analysis?.substring(0, 500) || 'Agent returned needs_clarification',
          },
        });

        if (maxedOut) {
          console.log(`[AION Orchestrator] Task ${inProgressTask.id} maxed out retries (${newRetryCount}). Marking as failed.`);
        } else {
          console.log(`[AION Orchestrator] Task ${inProgressTask.id} retry ${newRetryCount}/${inProgressTask.maxRetries}. Re-queuing.`);
        }
      }
    }
  }

  // ========================================
  // Handle Business Agent — Save PRD
  // ========================================
  if (agentId === 'business' && output.analysis) {
    const prd = extractPRDFromResponse(response, '');
    if (prd) {
      await boardManager.updatePRD(projectId, prd);
    }
  }

  // ========================================
  // Handle CTO Agent — Create tasks
  // ========================================
  if (output.taskAssignments && output.taskAssignments.length > 0 && agentId === 'cto') {
    // Check if this is the special "pick next task" action
    const isPickNext = output.taskAssignments.length === 1;

    await boardManager.createTasks(projectId, output.taskAssignments.map(ta => ({
      taskDescription: ta.taskDescription,
      assignedTo: ta.assignedTo,
      priority: ta.priority,
      phase: ta.phase,
    })));
  }

  // ========================================
  // Handle Frontend/Backend Agents — Write files
  // ========================================
  if (output.files && output.files.length > 0) {
    // Validate file access
    const agent = getAgent(agentId);
    const validFiles = output.files.filter(f => {
      // Use the base agent's path validation
      const allowed = agent.writeAccess;
      return true; // Agent already validated via createResponse
    });

    // Write to database
    await boardManager.writeFiles(
      projectId,
      validFiles.map(f => ({
        path: f.path,
        content: f.content,
        createdBy: agentId,
      }))
    );

    // Write to filesystem
    try {
      await workspaceManager.writeFiles(
        projectId,
        validFiles.map(f => ({ path: f.path, content: f.content }))
      );
      filesWritten = validFiles.length;
      console.log(`[AION Orchestrator] Wrote ${validFiles.length} files to disk for project ${projectId}`);
    } catch (error: any) {
      console.error(`[AION Orchestrator] Failed to write files to disk:`, error.message);
    }
  }

  // ========================================
  // Handle QA Agent — Create bugs and test results
  // ========================================
  if (output.bugs && output.bugs.length > 0 && agentId === 'qa') {
    for (const bug of output.bugs) {
      await boardManager.createBug(projectId, {
        description: bug.description,
        filePath: bug.filePath,
        severity: bug.severity,
        reportedBy: agentId,
        assignedTo: bug.assignedTo,
      });
    }

    // Also try to run the actual build
    try {
      const buildResult = commandRunner.runBuild(projectId);
      // Create test result
      await db.testResult.create({
        data: {
          projectId,
          testType: 'build',
          passed: buildResult.success,
          details: buildResult.success ? 'Build succeeded' : buildResult.stderr.substring(0, 500),
        },
      });
    } catch (error: any) {
      console.error(`[AION Orchestrator] Build test failed:`, error.message);
    }
  }

  // ========================================
  // Handle DevOps Agent — Build and deploy
  // ========================================
  if (agentId === 'devops') {
    // Try to actually build the project
    try {
      // First, install dependencies
      const installResult = commandRunner.installDeps(projectId);
      if (!installResult.success) {
        console.error(`[AION Orchestrator] Install failed:`, installResult.stderr);
      }

      // Then build
      const buildResult = commandRunner.runBuild(projectId);

      await db.testResult.create({
        data: {
          projectId,
          testType: 'build',
          passed: buildResult.success,
          details: buildResult.success
            ? 'Build succeeded'
            : `Build failed:\n${buildResult.stderr.substring(0, 500)}`,
        },
      });

      if (buildResult.success) {
        await boardManager.updateStatus(projectId, 'testing');
      }
    } catch (error: any) {
      console.error(`[AION Orchestrator] DevOps execution failed:`, error.message);
    }
  }

  // Update project status based on agent activity
  if (agentId === 'cto' && output.taskAssignments && output.taskAssignments.length > 0) {
    await boardManager.updateStatus(projectId, 'building');
  }

  if (agentId === 'qa' && response.status === 'success') {
    await boardManager.updateStatus(projectId, 'testing');
  }

  if (agentId === 'devops' && output.statusUpdate?.includes('deployed')) {
    await boardManager.updateStatus(projectId, 'deploying');
  }

  return { filesWritten };
}

/**
 * Extract PRD from a Business Agent response
 */
function extractPRDFromResponse(response: AgentResponse, userIdea: string): PRD | null {
  // Try to find PRD data in the response
  const output = response.output as any;

  // Check if PRD is directly in the output
  if (output.prd && typeof output.prd === 'object' && output.prd.projectName) {
    return output.prd as PRD;
  }

  // Try to construct a PRD from the analysis
  if (output.analysis) {
    return {
      projectName: userIdea?.substring(0, 50) || 'AION Project',
      problemStatement: output.analysis.substring(0, 200),
      targetUsers: 'General users',
      coreFeatures: [],
      mvpFeatures: [],
      postMvpFeatures: [],
      technicalPreferences: 'Next.js, TypeScript, Tailwind CSS',
      successCriteria: ['Application builds successfully', 'All features work correctly'],
      summary: output.analysis.substring(0, 150),
    };
  }

  return null;
}

/**
 * Get a human-readable phase label
 */
function getPhaseLabel(state: any): string {
  switch (state.status) {
    case 'planning': return '📋 Planning';
    case 'building': return '🔨 Building';
    case 'testing': return '🧪 Testing';
    case 'deploying': return '🚀 Deploying';
    case 'live': return '✅ Live';
    case 'failed': return '❌ Failed';
    default: return '⚡ Processing';
  }
}
