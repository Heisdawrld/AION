// AION — Orchestrator
// The autonomous loop that drives agent execution
// This is the HEART of AION

import { boardManager } from './board-manager';
import { getAgent } from '@/lib/agents/registry';
import type { AgentRole, AgentResponse, NextAction } from '@/lib/types/aion';

const MAX_CYCLES = 100;
const MIN_CONFIDENCE = 0.5;

export interface OrchestratorResult {
  success: boolean;
  message: string;
  agentResponses: AgentResponse[];
  projectStatus: string;
  liveUrl?: string;
}

/**
 * Run one step of the autonomous loop.
 * Returns the result and what should happen next.
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

  // Determine next action based on project state
  const nextAction = determineNextAction(state);

  console.log(`[AION Orchestrator] Next action: ${nextAction.type}`, nextAction.agent || '');

  const responses: AgentResponse[] = [];

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
          output: {
            analysis: `Agent execution failed: ${error.message}`,
          },
          confidence: 0,
        };
      }

      const duration = Date.now() - startTime;

      // Log the activity
      await boardManager.logAgentActivity(projectId, {
        agentRole: nextAction.agent,
        action: nextAction.task || 'execute',
        task: nextAction.task,
        duration,
        confidence: response.confidence,
        output: response.output,
      });

      // Process the response — update the board
      await processAgentResponse(projectId, response);

      responses.push(response);

      // Check confidence threshold
      if (response.confidence < MIN_CONFIDENCE) {
        return {
          success: false,
          message: `⚠️ Low confidence (${response.confidence}) from ${response.agentId}. Pausing for review.`,
          agentResponses: responses,
          projectStatus: state.status,
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
  };
}

/**
 * Determine what should happen next based on project state
 */
function determineNextAction(state: any): NextAction {
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

  // Priority 3: If there are pending tasks, run the next one
  if (state.pendingTaskCount > 0) {
    // Get the actual next pending task
    return {
      type: 'run_agent',
      agent: 'cto', // CTO will pick the next task and delegate
      task: 'Look at the pending tasks and the execution plan. Which task should be worked on next? Assign it and provide context for the specialist agent.',
    };
  }

  // Priority 4: If all tasks done but no QA yet, run QA
  if (state.pendingTaskCount === 0 && state.completedTaskCount > 0 && state.openBugCount === 0) {
    return {
      type: 'run_agent',
      agent: 'qa',
      task: 'Review all the code that has been created. Check for bugs, verify the build would succeed, and confirm all MVP features are covered.',
    };
  }

  // Priority 5: If deployed and live, we're done
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
 * Process an agent's response and update the board accordingly
 */
async function processAgentResponse(projectId: string, response: AgentResponse): Promise<void> {
  const { output, agentId } = response;

  // Write files if any
  if (output.files && output.files.length > 0) {
    await boardManager.writeFiles(
      projectId,
      output.files.map(f => ({
        path: f.path,
        content: f.content,
        createdBy: agentId,
      }))
    );
  }

  // Create task assignments if CTO provided them
  if (output.taskAssignments && output.taskAssignments.length > 0 && agentId === 'cto') {
    await boardManager.createTasks(
      projectId,
      output.taskAssignments.map(ta => ({
        taskDescription: ta.taskDescription,
        assignedTo: ta.assignedTo,
        priority: ta.priority,
        phase: ta.phase,
      }))
    );
  }

  // Create bug reports if QA found them
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
}

/**
 * Kick off a new project from a user's idea
 * This is the entry point when a user describes what they want to build
 */
export async function kickoffProject(projectId: string, userIdea: string): Promise<OrchestratorResult> {
  // Step 1: Have the Lead CTO analyze the idea and create initial assignments
  const ctoAgent = getAgent('cto');
  const context = await boardManager.buildAgentContext(projectId, 'cto');

  const startTime = Date.now();
  const response = await ctoAgent.kickoffProject(userIdea, context);
  const duration = Date.now() - startTime;

  // Log CTO activity
  await boardManager.logAgentActivity(projectId, {
    agentRole: 'cto',
    action: 'kickoff',
    task: `Analyze user idea: ${userIdea}`,
    duration,
    confidence: response.confidence,
    output: response.output,
  });

  // Process CTO response
  await processAgentResponse(projectId, response);

  // If CTO wants Business Strategist to create PRD first, run that
  if (response.output.taskAssignments?.some(ta => ta.assignedTo === 'business')) {
    const businessAgent = getAgent('business');
    const bizContext = await boardManager.buildAgentContext(projectId, 'business');

    const bizStart = Date.now();
    const bizResponse = await businessAgent.createPRD(userIdea, bizContext);
    const bizDuration = Date.now() - bizStart;

    await boardManager.logAgentActivity(projectId, {
      agentRole: 'business',
      action: 'create_prd',
      task: 'Create PRD from user idea',
      duration: bizDuration,
      confidence: bizResponse.confidence,
      output: bizResponse.output,
    });

    // Process Business response
    await processAgentResponse(projectId, bizResponse);

    return {
      success: true,
      message: response.output.statusUpdate || bizResponse.output.statusUpdate || 'Project initialized! CTO and Business Strategist are working on the plan.',
      agentResponses: [response, bizResponse],
      projectStatus: 'planning',
    };
  }

  return {
    success: true,
    message: response.output.statusUpdate || 'Project initialized! CTO is planning the approach.',
    agentResponses: [response],
    projectStatus: 'planning',
  };
}
