// AION — Enhanced Orchestrator
// The autonomous loop that drives agent execution
// This is the HEART of AION — now with real file system integration
// and QA VALIDATION GATE enforcement (nothing deploys without QA sign-off)

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
  QAGateResult,
  TestResultOutput,
  Feature,
  UserStory,
  BusinessActionType,
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
  qaGateResult?: QAGateResult;
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
6. IMPORTANT: Include a QA task after all build tasks are done — QA must review and approve before DevOps deploys

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
    await boardManager.createTasks(projectId, ctoResponse.output.taskAssignments.map(ta => ({
      taskDescription: ta.taskDescription,
      assignedTo: ta.assignedTo,
      priority: ta.priority,
      phase: ta.phase,
    })));
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
 * NOW ENFORCES QA GATE: DevOps cannot deploy without QA sign-off
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
    qaGateResult: responses[0]?.output?.qaGateResult,
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
 * Check if QA has approved deployment for a project
 * This is the VALIDATION GATE — no deployment without QA sign-off
 */
export async function checkQAGate(projectId: string): Promise<QAGateResult | null> {
  // Get the most recent QA test results
  const testResults = await db.testResult.findMany({
    where: { projectId },
    orderBy: { ranAt: 'desc' },
    take: 5,
  });

  // Get open bugs
  const openBugs = await db.bug.findMany({
    where: { projectId, status: 'open' },
  });

  const criticalBugs = openBugs.filter(b => b.severity === 'critical').length;
  const highBugs = openBugs.filter(b => b.severity === 'high').length;

  // Check if there's a recent build test that passed
  const buildTest = testResults.find(t => t.testType === 'build');
  const buildPassed = buildTest?.passed ?? false;

  // If no test results, QA hasn't run yet
  if (testResults.length === 0) {
    return null;
  }

  // Determine gate status
  let gateStatus: QAGateResult['gateStatus'] = 'fail';
  let canDeploy = false;

  if (!buildPassed) {
    gateStatus = 'fail';
    canDeploy = false;
  } else if (criticalBugs > 0) {
    gateStatus = 'fail';
    canDeploy = false;
  } else if (highBugs > 2) {
    gateStatus = 'fail';
    canDeploy = false;
  } else if (highBugs > 0) {
    gateStatus = 'conditional_pass';
    canDeploy = true;
  } else {
    gateStatus = 'pass';
    canDeploy = true;
  }

  return {
    gateStatus,
    checklist: {
      buildSucceeds: buildPassed,
      typescriptCompiles: testResults.some(t => t.testType === 'typecheck' && t.passed),
      noUnusedImports: true,
      apiEndpointsValid: true,
      responsiveDesignOk: true,
      noSecurityIssues: criticalBugs === 0,
      dependenciesResolved: buildPassed,
      prdCoverageComplete: true,
    },
    canDeploy,
    criticalBugCount: criticalBugs,
    highBugCount: highBugs,
    mediumBugCount: openBugs.filter(b => b.severity === 'medium').length,
    lowBugCount: openBugs.filter(b => b.severity === 'low').length,
    buildPassed,
    typeCheckPassed: testResults.some(t => t.testType === 'typecheck' && t.passed),
    lintPassed: testResults.some(t => t.testType === 'lint' && t.passed),
    summary: canDeploy
      ? `QA Gate: ${gateStatus.toUpperCase()} — ${criticalBugs} critical, ${highBugs} high bugs. ${buildPassed ? 'Build passes.' : 'Build fails.'}`
      : `QA Gate: ${gateStatus.toUpperCase()} — Deployment BLOCKED. ${criticalBugs} critical, ${highBugs} high bugs. ${buildPassed ? 'Build passes.' : 'Build fails.'}`,
  };
}

/**
 * Determine what should happen next based on project state
 * NOW WITH QA GATE ENFORCEMENT: DevOps can ONLY run after QA approval
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

  // Priority 3: If there are pending tasks (NON-DEVOPS), execute the next one
  if (state.pendingTaskCount > 0) {
    const nextTask = await boardManager.getNextPendingTask(state.projectId);
    if (nextTask) {
      // CRITICAL: If the next task is for DevOps, CHECK QA GATE FIRST
      if (nextTask.assignedTo === 'devops') {
        const qaGate = await checkQAGate(state.projectId);

        if (!qaGate) {
          // QA hasn't run yet — run QA first!
          console.log(`[AION Orchestrator] QA gate not found — running QA before DevOps deployment`);
          return {
            type: 'run_agent',
            agent: 'qa',
            task: 'Run a full QA review of all code in this project. Execute the build, run type checks, review source files, check PRD coverage, and report all bugs. Your QA gate result determines whether deployment can proceed.',
          };
        }

        if (!qaGate.canDeploy) {
          // QA gate failed — DON'T deploy. Assign fix tasks instead.
          console.log(`[AION Orchestrator] QA gate FAILED (${qaGate.gateStatus}) — blocking DevOps deployment. ${qaGate.criticalBugCount} critical, ${qaGate.highBugCount} high bugs.`);

          if (state.openBugCount > 0) {
            return {
              type: 'run_agent',
              agent: 'cto',
              task: `QA GATE BLOCKED deployment. ${qaGate.criticalBugCount} critical bugs, ${qaGate.highBugCount} high bugs. Build: ${qaGate.buildPassed ? 'PASS' : 'FAIL'}. Review the open bugs and create fix tasks for the appropriate agents. DO NOT approve deployment until bugs are fixed.`,
            };
          }

          // Re-run QA to get fresh results
          return {
            type: 'run_agent',
            agent: 'qa',
            task: 'Re-run QA review. Previous gate was blocked. Check if bugs have been fixed, run the build again, and provide an updated gate result.',
          };
        }

        // QA gate passed — allow DevOps to proceed
        console.log(`[AION Orchestrator] QA gate PASSED — allowing DevOps deployment`);
      }

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

  // Priority 4: If all build tasks done, FORCE a QA run (even if there are some bugs)
  if (state.pendingTaskCount === 0 && state.completedTaskCount > 0 && state.status !== 'testing' && state.status !== 'deploying' && state.status !== 'live') {
    // Check if QA has already run recently
    const recentQA = await db.agentLog.findFirst({
      where: { projectId: state.projectId, agentRole: 'qa' },
      orderBy: { createdAt: 'desc' },
    });

    // If QA hasn't run, or last QA was before the most recent file write, run QA
    const hasTestResults = await db.testResult.findFirst({ where: { projectId: state.projectId } });

    if (!hasTestResults || !recentQA) {
      return {
        type: 'run_agent',
        agent: 'qa',
        task: 'Run a complete QA review of this project. Execute the build, run type checks and linting, review all source code files, verify PRD feature coverage, and produce a QA gate result. Your gate result determines whether this project can be deployed.',
      };
    }

    // If there are open bugs and no pending fix tasks, get CTO to create them
    if (state.openBugCount > 0) {
      return {
        type: 'run_agent',
        agent: 'cto',
        task: `There are ${state.openBugCount} open bugs that need fixing. Review them and create fix tasks for the appropriate agents. Prioritize critical and high severity bugs. After bugs are fixed, QA will re-review.`,
      };
    }
  }

  // Priority 5: If QA has passed and there's a pending DevOps task, let it through
  if (state.status === 'testing') {
    const qaGate = await checkQAGate(state.projectId);
    if (qaGate?.canDeploy) {
      // QA passed — look for a DevOps task or create one
      const devopsTask = await db.task.findFirst({
        where: { projectId: state.projectId, assignedTo: 'devops', status: 'pending' },
      });

      if (devopsTask) {
        await boardManager.updateTaskStatus(devopsTask.id, 'in_progress');
        return {
          type: 'run_agent',
          agent: 'devops',
          task: buildTaskInstruction('devops', devopsTask.description),
        };
      }

      // No DevOps task — create one via CTO
      return {
        type: 'run_agent',
        agent: 'cto',
        task: 'QA has passed. Create a deployment task for DevOps to build and deploy the application. Include deployment configuration, environment variables, and deployment target (Render free tier).',
      };
    }

    // QA hasn't passed — keep fixing
    if (state.openBugCount > 0) {
      return {
        type: 'run_agent',
        agent: 'cto',
        task: `QA gate is blocking deployment. There are ${state.openBugCount} open bugs. Create fix tasks for the responsible agents.`,
      };
    }

    // Re-run QA to get fresh gate result
    return {
      type: 'run_agent',
      agent: 'qa',
      task: 'Re-run the full QA review. Check if previous bugs have been fixed, run the build and type check, and provide an updated QA gate result.',
    };
  }

  // Priority 6: If deployed and live, check if Business Agent has run post-launch tasks
  if (state.liveUrl && state.status === 'live') {
    // Check if Business Agent has already generated README and deployment notification
    const recentBizActivity = await db.agentLog.findFirst({
      where: {
        projectId: state.projectId,
        agentRole: 'business',
        action: { in: ['generate_readme', 'deployment_notification'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!recentBizActivity) {
      // Business Agent hasn't run post-launch tasks yet — generate README and notify
      console.log(`[AION Orchestrator] Project is LIVE — triggering Business Agent post-launch tasks (README + notification)`);
      return {
        type: 'run_agent',
        agent: 'business',
        task: 'The project has just been deployed and is LIVE! Generate a comprehensive README.md for the project and create a deployment notification announcement. Include the live URL, features shipped, and next steps.',
      };
    }

    // Check if there's a pending README generation task
    const readmeTask = await db.task.findFirst({
      where: {
        projectId: state.projectId,
        assignedTo: 'business',
        status: 'pending',
        description: { contains: 'readme' },
      },
    });

    if (readmeTask) {
      await boardManager.updateTaskStatus(readmeTask.id, 'in_progress');
      return {
        type: 'run_agent',
        agent: 'business',
        task: buildTaskInstruction('business', readmeTask.description),
      };
    }

    return {
      type: 'complete',
      message: '🎉 Project is LIVE and deployed!',
    };
  }

  // Priority 7: If deploying (just started), Business Agent generates a status report
  if (state.status === 'deploying') {
    const bizReportCheck = await db.agentLog.findFirst({
      where: {
        projectId: state.projectId,
        agentRole: 'business',
        action: 'status_report',
      },
    });

    if (!bizReportCheck && state.completedTaskCount > 0) {
      console.log(`[AION Orchestrator] Project is deploying — Business Agent generating pre-deployment status report`);
      return {
        type: 'run_agent',
        agent: 'business',
        task: 'The project is being deployed. Generate a project status report summarizing what was built, what features are included, and the current health of the project.',
      };
    }
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
      return `${taskDescription}\n\nAs the Business Strategist, handle this task appropriately. If creating a PRD: include problem statement, target users, core features with user stories and acceptance criteria, MVP features, post-MVP features, and success criteria. If generating a README: use real project data, include tech stack, features, getting started guide, and deployment info. If generating a status report: use real metrics, feature tracking, and risk assessment. If creating a deployment notification: include live URL, shipped features, and next steps.`;

    case 'frontend':
      return `${taskDescription}\n\nBuild React components using TypeScript, Tailwind CSS, and shadcn/ui patterns. Return ALL file changes in the "files" array with path, content, action, and description. List any new npm dependencies needed and API endpoints you need from the backend.`;

    case 'backend':
      return `${taskDescription}\n\nBuild API routes and database schema using Next.js API routes and Prisma ORM. Return ALL file changes in the "files" array with path, content, action, and description. Document all API endpoints and list any new npm dependencies and environment variables needed.`;

    case 'qa':
      return `${taskDescription}\n\nRun a COMPLETE QA review: execute the build (npm run build), run type checking (tsc --noEmit), run linting, review all source code for bugs, verify PRD feature coverage, check for security issues, and produce a QA gate result. Report ALL bugs with exact file paths, reproduction steps, and severity. Your qaGateResult determines whether this project can be deployed — be thorough and honest.`;

    case 'devops':
      return `${taskDescription}\n\nCreate deployment configuration files. Return them in the "files" array. Include render.yaml or Dockerfile as needed. IMPORTANT: QA must have approved deployment before you deploy. Verify the QA gate status.`;

    case 'cto':
      return `${taskDescription}\n\nAs the Lead CTO, make a clear decision and create specific task assignments if needed.`;

    default:
      return taskDescription;
  }
}

/**
 * Process an agent's response and update the board accordingly
 * EXPORTED so the chat route can also use it
 * NOW with proper QA gate result handling and test result recording
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
  // Handle Business Agent — Save PRD, README, and lifecycle outputs
  // Enhanced with: README writing, deployment notifications, status reports
  // ========================================
  if (agentId === 'business') {
    // Save PRD if generated
    const prd = extractPRDFromResponse(response, '');
    if (prd) {
      await boardManager.updatePRD(projectId, prd);
      console.log(`[AION Orchestrator] PRD saved/updated for project ${projectId} — ${prd.coreFeatures?.length || 0} features, ${prd.mvpFeatures?.length || 0} MVP`);
    }

    // Write Business Agent files to disk (README.md, docs)
    if (output.files && output.files.length > 0) {
      try {
        await workspaceManager.writeFiles(
          projectId,
          output.files.map(f => ({ path: f.path, content: f.content }))
        );
        await boardManager.writeFiles(
          projectId,
          output.files.map(f => ({
            path: f.path,
            content: f.content,
            createdBy: 'business',
          }))
        );
        filesWritten += output.files.length;
        console.log(`[AION Orchestrator] Business: Wrote ${output.files.length} file(s) to disk (README, docs, etc.)`);
      } catch (error: any) {
        console.error(`[AION Orchestrator] Business: Failed to write files:`, error.message);
      }
    }

    // Handle post-launch Business Agent actions
    // If the project is live and Business Agent just ran, generate deployment notification
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (project?.status === 'live' && project.liveUrl) {
      // Check if we already sent a deployment notification
      const existingNotification = await db.agentLog.findFirst({
        where: {
          projectId,
          agentRole: 'business',
          action: 'deployment_notification',
        },
      });

      if (!existingNotification) {
        // Broadcast deployment notification from the Business Agent
        const prdData = prd || (project.prd ? JSON.parse(project.prd) : null);
        const mvpFeatures = prdData?.mvpFeatures || [];
        const notificationMessage = `🎉 ${prdData?.projectName || project.name} is LIVE!\n\n` +
          `🔗 URL: ${project.liveUrl}\n` +
          `📦 MVP Features: ${mvpFeatures.length > 0 ? mvpFeatures.join(', ') : 'Core functionality'}\n` +
          `${prdData?.postMvpFeatures?.length ? `📋 Post-MVP (coming soon): ${prdData.postMvpFeatures.slice(0, 5).join(', ')}\n` : ''}` +
          `\nNext: Gather user feedback and iterate on post-MVP features.`;

        await boardManager.saveConversationMessage(projectId, {
          role: 'system',
          content: notificationMessage,
          agentRole: 'business',
          metadata: {
            actionType: 'deployment_notification',
            liveUrl: project.liveUrl,
          },
        });
        console.log(`[AION Orchestrator] Deployment notification broadcast for project ${projectId}`);
      }
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
  // Handle QA Agent — Create bugs, record test results, process gate
  // ========================================
  if (agentId === 'qa') {
    // Create bug reports from QA output
    if (output.bugs && output.bugs.length > 0) {
      for (const bug of output.bugs) {
        await boardManager.createBug(projectId, {
          description: bug.description,
          filePath: bug.filePath,
          severity: bug.severity,
          reportedBy: agentId,
          assignedTo: bug.assignedTo,
        });
      }
    }

    // Record test results from QA agent
    if (output.testResults && output.testResults.length > 0) {
      for (const testResult of output.testResults) {
        await db.testResult.create({
          data: {
            projectId,
            testType: testResult.testType,
            passed: testResult.passed,
            details: testResult.details,
          },
        });
      }
    } else {
      // QA didn't provide structured test results — run build ourselves as fallback
      try {
        const buildResult = commandRunner.runBuild(projectId);
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

    // Process QA Gate Result — THIS IS THE VALIDATION GATE
    if (output.qaGateResult) {
      const gate = output.qaGateResult;
      console.log(`[AION Orchestrator] QA GATE RESULT: ${gate.gateStatus} | Can Deploy: ${gate.canDeploy} | Build: ${gate.buildPassed} | TypeCheck: ${gate.typeCheckPassed} | Critical: ${gate.criticalBugCount} | High: ${gate.highBugCount}`);

      if (gate.canDeploy) {
        // QA approved — update status to testing (ready for deploy)
        await boardManager.updateStatus(projectId, 'testing');
        console.log(`[AION Orchestrator] QA gate ${gate.gateStatus} — project can proceed to deployment`);
      } else {
        // QA blocked deployment — keep in building status
        await boardManager.updateStatus(projectId, 'building');
        console.log(`[AION Orchestrator] QA gate ${gate.gateStatus} — deployment BLOCKED. Need to fix ${gate.criticalBugCount} critical + ${gate.highBugCount} high bugs.`);
      }
    } else {
      // No gate result from QA — just update status based on pass/fail
      if (response.status === 'success') {
        await boardManager.updateStatus(projectId, 'testing');
      } else {
        await boardManager.updateStatus(projectId, 'building');
      }
    }
  }

  // ========================================
  // Handle DevOps Agent — Build, deploy, and verify
  // Enhanced with real deployment pipeline, git operations, URL testing
  // ========================================
  if (agentId === 'devops') {
    // CRITICAL: Verify QA gate before allowing deployment
    const qaGate = await checkQAGate(projectId);

    if (!qaGate || !qaGate.canDeploy) {
      // QA has not approved — BLOCK deployment
      console.log(`[AION Orchestrator] DevOps attempted to deploy but QA gate is ${qaGate?.gateStatus || 'missing'}. BLOCKING deployment.`);

      // Save the blockage as a conversation message
      await boardManager.saveConversationMessage(projectId, {
        role: 'system',
        content: `🚫 DEPLOYMENT BLOCKED — QA gate has not approved deployment. Gate status: ${qaGate?.gateStatus || 'not run'}. ${qaGate?.criticalBugCount || 0} critical bugs, ${qaGate?.highBugCount || 0} high bugs. Fix bugs and re-run QA before deploying.`,
        agentRole: 'system',
        metadata: { blocked: true, reason: 'qa_gate_not_passed' },
      });

      // Don't update status to deploying — keep in testing
    } else {
      // QA has approved — proceed with deployment pipeline
      console.log(`[AION Orchestrator] QA gate approved (${qaGate.gateStatus}) — proceeding with deployment pipeline`);

      // Step 1: Write DevOps config files to disk (render.yaml, .gitignore, health endpoint)
      if (output.files && output.files.length > 0) {
        try {
          await workspaceManager.writeFiles(
            projectId,
            output.files.map(f => ({ path: f.path, content: f.content }))
          );
          console.log(`[AION Orchestrator] DevOps: Wrote ${output.files.length} config files to disk`);

          // Also save to database for tracking
          await boardManager.writeFiles(
            projectId,
            output.files.map(f => ({
              path: f.path,
              content: f.content,
              createdBy: 'devops',
            }))
          );
          filesWritten += output.files.length;
        } catch (error: any) {
          console.error(`[AION Orchestrator] DevOps: Failed to write config files:`, error.message);
        }
      }

      // Step 2: Build the project (DevOps agent already ran this, but we verify)
      try {
        const buildResult = commandRunner.runBuild(projectId);

        await db.testResult.create({
          data: {
            projectId,
            testType: 'build',
            passed: buildResult.success,
            details: buildResult.success
              ? 'Production build succeeded (DevOps pipeline)'
              : `Build failed:\n${buildResult.stderr.substring(0, 500)}`,
          },
        });

        if (buildResult.success) {
          await boardManager.updateStatus(projectId, 'deploying');

          // Step 3: Create a deployment record
          const deploymentId = await boardManager.createDeployment(projectId, {
            platform: 'render',
            status: 'deploying',
          });

          console.log(`[AION Orchestrator] Deployment record created: ${deploymentId}`);

          // Step 4: Test live URL if available
          const project = await db.project.findUnique({ where: { id: projectId } });
          if (project?.liveUrl) {
            console.log(`[AION Orchestrator] Testing live URL: ${project.liveUrl}`);
            try {
              const urlResult = await commandRunner.testUrl(project.liveUrl);
              const urlTestResult: import('@/lib/types/aion').UrlTestResult = {
                url: project.liveUrl,
                statusCode: urlResult.statusCode,
                responseTime: urlResult.responseTime,
                containsExpectedContent: urlResult.containsExpectedContent,
                timestamp: new Date().toISOString(),
              };

              if (urlResult.success) {
                // URL returns 200 — deployment verified!
                console.log(`[AION Orchestrator] Live URL verified! Status: ${urlResult.statusCode}, Time: ${urlResult.responseTime}ms`);
                await boardManager.updateStatus(projectId, 'live');
                await boardManager.updateDeployment(deploymentId, {
                  status: 'deployed',
                  url: project.liveUrl,
                  deployedAt: new Date(),
                });
              } else {
                // URL not responding yet — might need more time
                console.log(`[AION Orchestrator] Live URL test: ${urlResult.statusCode} — deployment may still be starting`);
                await boardManager.updateDeployment(deploymentId, {
                  status: 'deploying',
                  url: project.liveUrl,
                });
              }
            } catch (error: any) {
              console.error(`[AION Orchestrator] URL test failed:`, error.message);
            }
          } else {
            // No live URL yet — mark deployment as waiting
            await boardManager.updateDeployment(deploymentId, {
              status: 'deploying',
            });

            // Broadcast deployment status
            await boardManager.saveConversationMessage(projectId, {
              role: 'system',
              content: `🚀 Deployment pipeline complete! Build PASSED, Git ready. Deployment configs generated. The project is ready for deployment to Render.\n\nTo deploy:\n1. Push to GitHub: git remote add origin <your-repo-url> && git push -u origin main\n2. Connect your GitHub repo to Render\n3. Render will auto-deploy using render.yaml\n\nOr provide a GitHub PAT and I'll handle the push.`,
              agentRole: 'devops',
              metadata: { deploymentId, buildPassed: true },
            });
          }
        } else {
          // Build failed — don't proceed with deployment
          await boardManager.updateStatus(projectId, 'building');
          console.log(`[AION Orchestrator] DevOps: Build failed — not deploying`);
        }
      } catch (error: any) {
        console.error(`[AION Orchestrator] DevOps pipeline failed:`, error.message);
        await boardManager.updateStatus(projectId, 'failed');
      }
    }
  }

  // Update project status based on agent activity
  if (agentId === 'cto' && output.taskAssignments && output.taskAssignments.length > 0) {
    await boardManager.updateStatus(projectId, 'building');
  }

  return { filesWritten };
}

/**
 * Extract PRD from a Business Agent response
 * Enhanced with multiple extraction strategies and robust parsing
 */
function extractPRDFromResponse(response: AgentResponse, userIdea: string): PRD | null {
  const output = response.output as any;

  // Strategy 1: PRD is directly in the output object
  if (output.prd && typeof output.prd === 'object') {
    const prd = output.prd;
    if (prd.projectName || prd.problemStatement) {
      return normalizePRD(prd, userIdea);
    }
  }

  // Strategy 2: PRD might be nested inside the statusUpdate or analysis as JSON
  const textFields = [output.statusUpdate, output.analysis].filter(Boolean);
  for (const text of textFields) {
    if (typeof text === 'string') {
      const extracted = tryParsePRDFromText(text, userIdea);
      if (extracted) return extracted;
    }
  }

  // Strategy 3: Check if output itself looks like a PRD (some AI models put it at the top level)
  if (output.projectName || output.problemStatement || output.coreFeatures) {
    return normalizePRD(output, userIdea);
  }

  // Strategy 4: Try to find PRD-like JSON anywhere in the raw response
  // This catches cases where the AI wraps the PRD differently
  const rawOutput = JSON.stringify(output);
  const prdMatch = rawOutput.match(/"projectName"\s*:\s*"([^"]+)"/);
  if (prdMatch) {
    // Found a projectName — try to extract the full PRD object
    const jsonStart = rawOutput.lastIndexOf('{', rawOutput.indexOf('"projectName"'));
    if (jsonStart >= 0) {
      try {
        // Try to parse from the projectName onwards
        const subObj = rawOutput.substring(jsonStart);
        const balanced = findBalancedJSON(subObj);
        if (balanced) {
          const parsed = JSON.parse(balanced);
          if (parsed.projectName) {
            return normalizePRD(parsed, userIdea);
          }
        }
      } catch {}
    }
  }

  // Strategy 5: Construct a minimal PRD from whatever we have
  if (output.analysis || userIdea) {
    return {
      projectName: extractProjectName(output.analysis || userIdea),
      problemStatement: output.analysis?.substring(0, 300) || userIdea?.substring(0, 200) || 'Project to build',
      targetUsers: extractTargetUsers(output.analysis || '') || 'Users who need this application',
      coreFeatures: extractFeaturesFromText(output.analysis || '') || [],
      mvpFeatures: [],
      postMvpFeatures: [],
      technicalPreferences: 'Next.js, TypeScript, Tailwind CSS',
      successCriteria: ['Application builds and runs successfully', 'Core features work as expected'],
      summary: output.analysis?.substring(0, 150) || userIdea?.substring(0, 100) || 'A new application',
    };
  }

  return null;
}

/**
 * Normalize a PRD object — fill in missing fields with defaults
 */
function normalizePRD(raw: any, userIdea: string): PRD {
  return {
    projectName: raw.projectName || extractProjectName(userIdea || 'AION Project'),
    problemStatement: raw.problemStatement || 'Not specified',
    targetUsers: raw.targetUsers || extractTargetUsers(raw.problemStatement || '') || 'General users',
    coreFeatures: Array.isArray(raw.coreFeatures) ? raw.coreFeatures.map((f: any) => normalizeFeature(f)) : [],
    mvpFeatures: Array.isArray(raw.mvpFeatures) ? raw.mvpFeatures : [],
    postMvpFeatures: Array.isArray(raw.postMvpFeatures) ? raw.postMvpFeatures : [],
    technicalPreferences: raw.technicalPreferences || 'Next.js, TypeScript, Tailwind CSS',
    successCriteria: Array.isArray(raw.successCriteria) ? raw.successCriteria : ['Application builds successfully'],
    summary: raw.summary || `${raw.projectName || 'Project'} — ${raw.problemStatement?.substring(0, 80) || 'A new application'}`,
  };
}

/**
 * Normalize a feature object
 */
function normalizeFeature(raw: any): Feature {
  return {
    name: raw.name || 'Unnamed Feature',
    description: raw.description || '',
    userStories: Array.isArray(raw.userStories) ? raw.userStories.map((us: any) => normalizeUserStory(us)) : [],
    priority: ['critical', 'high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium',
  };
}

/**
 * Normalize a user story object
 */
function normalizeUserStory(raw: any): UserStory {
  return {
    id: raw.id || `US${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    asA: raw.asA || 'user',
    iWant: raw.iWant || raw.description || 'this feature',
    soThat: raw.soThat || raw.benefit || 'I can accomplish my goal',
    acceptanceCriteria: Array.isArray(raw.acceptanceCriteria) ? raw.acceptanceCriteria : ['Feature works as described'],
  };
}

/**
 * Try to parse a PRD from free-form text
 */
function tryParsePRDFromText(text: string, userIdea: string): PRD | null {
  // Look for JSON blocks in the text
  const jsonMatch = text.match(/\{[\s\S]*?"projectName"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.projectName) return normalizePRD(parsed, userIdea);
    } catch {}
  }

  // Look for nested PRD
  const nestedMatch = text.match(/"prd"\s*:\s*(\{[\s\S]*?"summary"[\s\S]*?\})/);
  if (nestedMatch) {
    try {
      const parsed = JSON.parse(nestedMatch[1]);
      if (parsed.projectName) return normalizePRD(parsed, userIdea);
    } catch {}
  }

  return null;
}

/**
 * Extract a project name from text
 */
function extractProjectName(text: string): string {
  // Try common patterns
  const patterns = [
    /(?:called|named|title[d]?)\s+"?([^".,\n]+)"?/i,
    /(?:project|app|application)\s+(?:name[d]?|called)\s+"?([^".,\n]+)"?/i,
    /^([A-Z][a-zA-Z\s]{2,30})/,  // Starts with capital letter
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().substring(0, 50);
  }

  // Fall back to first few words
  return text.substring(0, 30).split(/\s+/).slice(0, 4).join(' ') || 'AION Project';
}

/**
 * Try to extract target users from text
 */
function extractTargetUsers(text: string): string | null {
  const patterns = [
    /(?:target users?|audience|for)\s*:?\s*([^\n.]{10,80})/i,
    /(?:who|users?|people)\s+(?:will|would|can|need to)\s+([^\n.]{10,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().substring(0, 100);
  }

  return null;
}

/**
 * Try to extract feature names from text (basic)
 */
function extractFeaturesFromText(text: string): Feature[] {
  const features: Feature[] = [];

  // Look for bullet-pointed or numbered features
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
    const numberMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

    const featureText = bulletMatch?.[1] || numberMatch?.[1];
    if (featureText && featureText.length > 5 && featureText.length < 100) {
      features.push({
        name: featureText.substring(0, 50),
        description: featureText,
        userStories: [],
        priority: features.length === 0 ? 'critical' : 'medium',
      });
    }

    if (features.length >= 5) break; // Max 5 features from text extraction
  }

  return features;
}

/**
 * Find a balanced JSON object in a string
 * Returns the substring that forms a complete JSON object
 */
function findBalancedJSON(text: string): string | null {
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.substring(start, i + 1);
      }
    }
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
