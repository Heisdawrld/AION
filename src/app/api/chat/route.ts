// AION - Chat API Route
// Main endpoint for user interaction with the AION system.

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { kickoffProject, processAgentResponse, runOrchestrationStep, type OrchestratorResult } from '@/lib/engine/orchestrator';
import { LeadCTOAgent } from '@/lib/agents/lead-cto';
import { getAgent } from '@/lib/agents/registry';

export const maxDuration = 60;

const ctoAgent = new LeadCTOAgent();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, projectId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let currentProjectId = projectId;

    if (!currentProjectId) {
      const initialIntent = detectInitialIntent(message);

      if (initialIntent === 'greeting') {
        const greeting = buildGreetingResponse(message);
        return NextResponse.json({
          projectId: null,
          message: greeting.statusUpdate,
          agentResponses: [{
            agentId: 'cto',
            status: 'success',
            statusUpdate: greeting.statusUpdate,
            analysis: greeting.analysis,
            confidence: 0.96,
            taskAssignments: [],
            filesCount: 0,
            bugsCount: 0,
          }],
          projectStatus: 'idle',
        });
      }

      currentProjectId = await boardManager.createProject(inferProjectName(message), message);

      await boardManager.saveConversationMessage(currentProjectId, {
        role: 'user',
        content: message,
      });

      const result = await safeKickoffProject(currentProjectId, message);

      const kickoffProjectData = await boardManager.getProject(currentProjectId);
      const kickoffCtoResponse = result.agentResponses.find(response => response.agentId === 'cto');
      if (kickoffCtoResponse && kickoffProjectData && isWeakCtoMessage(kickoffCtoResponse.output.statusUpdate)) {
        kickoffCtoResponse.status = 'success';
        kickoffCtoResponse.output.statusUpdate = buildCtoFallbackMessage(kickoffProjectData, 'kickoff');
        kickoffCtoResponse.output.analysis =
          kickoffCtoResponse.output.analysis || 'Fallback CTO kickoff briefing generated from live project state.';
      }

      const ctoResponse = result.agentResponses.find(response => response.agentId === 'cto');
      if (ctoResponse?.output?.statusUpdate) {
        await boardManager.saveConversationMessage(currentProjectId, {
          role: 'cto',
          content: ctoResponse.output.statusUpdate,
          agentRole: 'cto',
          metadata: {
            confidence: ctoResponse.confidence,
            taskAssignments: ctoResponse.output.taskAssignments,
          },
        });
      }

      const bizResponse = result.agentResponses.find(response => response.agentId === 'business');
      if (bizResponse?.output?.statusUpdate) {
        await boardManager.saveConversationMessage(currentProjectId, {
          role: 'system',
          content: bizResponse.output.statusUpdate,
          agentRole: 'business',
          metadata: { confidence: bizResponse.confidence },
        });
      }

      return NextResponse.json({
        projectId: currentProjectId,
        message: ctoResponse?.output.statusUpdate || result.message,
        agentResponses: ctoResponse ? [mapAgentResponse(ctoResponse, 'kickoff')] : [],
        projectStatus: result.projectStatus,
        liveUrl: result.liveUrl,
        phase: result.phase,
        qaGateResult: result.qaGateResult,
      });
    }

    await boardManager.saveConversationMessage(currentProjectId, {
      role: 'user',
      content: message,
    });

    const conversationHistory = await boardManager.buildConversationContext(currentProjectId, 20);
    const projectContext = await boardManager.buildAgentContext(currentProjectId, 'cto');
    let projectData = await boardManager.getProject(currentProjectId);
    const intent = detectUserIntent(message);

    let ctoResult;
    let orchestrationResult: Awaited<ReturnType<typeof runOrchestrationStep>> | null = null;

    switch (intent) {
      case 'change_request': {
        ctoResult = await safeCtoConverse(message, conversationHistory, projectContext, projectData, intent);
        if (ctoResult.output.taskAssignments && ctoResult.output.taskAssignments.length > 0) {
          await boardManager.createTasks(
            currentProjectId,
            ctoResult.output.taskAssignments.map(taskAssignment => ({
              taskDescription: taskAssignment.taskDescription,
              assignedTo: taskAssignment.assignedTo,
              priority: taskAssignment.priority,
              phase: taskAssignment.phase,
            }))
          );
        }
        break;
      }

      case 'continue_build': {
        ctoResult = await safeCtoConverse(
          'The user wants to continue building. Give them the current call, the operational state, and the next move.',
          conversationHistory,
          projectContext,
          projectData,
          intent
        );
        orchestrationResult = await runOrchestrationStep(currentProjectId);
        break;
      }

      case 'qa_query': {
        ctoResult = await safeCtoConverse(message, conversationHistory, projectContext, projectData, intent);
        orchestrationResult = await runOrchestrationStep(currentProjectId);
        break;
      }

      case 'prd_query': {
        ctoResult = await safeCtoConverse(message, conversationHistory, projectContext, projectData, intent);
        const state = await boardManager.getProjectState(currentProjectId);
        const lowerMessage = message.toLowerCase();

        if (state?.prd && (lowerMessage.includes('revise') || lowerMessage.includes('update prd') || lowerMessage.includes('change prd'))) {
          const bizAgent = getAgent('business');
          const bizContext = await boardManager.buildAgentContext(currentProjectId, 'business');
          const bizResult = await bizAgent.execute(
            `The user wants to revise the PRD. Their feedback: "${message}". Review the current PRD and make the requested changes.`,
            bizContext
          );

          await processAgentResponse(currentProjectId, bizResult);

          if (bizResult.output.statusUpdate) {
            await boardManager.saveConversationMessage(currentProjectId, {
              role: 'system',
              content: bizResult.output.statusUpdate,
              agentRole: 'business',
              metadata: { confidence: bizResult.confidence },
            });
          }
        }
        break;
      }

      default: {
        ctoResult = await safeCtoConverse(message, conversationHistory, projectContext, projectData, intent);
        break;
      }
    }

    if (projectData && isWeakCtoMessage(ctoResult.output.statusUpdate)) {
      ctoResult.status = 'success';
      ctoResult.output.statusUpdate = buildCtoFallbackMessage(projectData, intent);
      ctoResult.output.analysis =
        ctoResult.output.analysis || 'Fallback CTO briefing generated from current project state.';
    }

    if (ctoResult.output.statusUpdate) {
      await boardManager.saveConversationMessage(currentProjectId, {
        role: 'cto',
        content: ctoResult.output.statusUpdate,
        agentRole: 'cto',
        metadata: {
          confidence: ctoResult.confidence,
          taskAssignments: ctoResult.output.taskAssignments,
          actionType: intent,
        },
      });
    }

    if (ctoResult.output.taskAssignments && ctoResult.output.taskAssignments.length > 0) {
      await boardManager.createTasks(
        currentProjectId,
        ctoResult.output.taskAssignments.map(taskAssignment => ({
          taskDescription: taskAssignment.taskDescription,
          assignedTo: taskAssignment.assignedTo,
          priority: taskAssignment.priority,
          phase: taskAssignment.phase,
        }))
      );

      await boardManager.logAgentActivity(currentProjectId, {
        agentRole: 'cto',
        action: 'create_tasks_from_conversation',
        task: `Created ${ctoResult.output.taskAssignments.length} tasks from user conversation`,
        confidence: ctoResult.confidence,
        output: ctoResult.output,
      });
    }

    const allAgentResponses = [ctoResult];

    if (orchestrationResult) {
      for (const response of orchestrationResult.agentResponses) {
        if (response.output.statusUpdate) {
          await boardManager.saveConversationMessage(currentProjectId, {
            role: 'system',
            content: response.output.statusUpdate,
            agentRole: response.agentId,
            metadata: { confidence: response.confidence },
          });
        }
      }
    }

    const updatedState = await boardManager.getProjectState(currentProjectId);
    projectData = await boardManager.getProject(currentProjectId);

    const orchestrationSummary = orchestrationResult
      ? summarizeOrchestration(orchestrationResult.agentResponses)
      : null;

    if (orchestrationSummary && ctoResult.output.statusUpdate) {
      ctoResult.output.statusUpdate = `${ctoResult.output.statusUpdate} ${orchestrationSummary}`;
    }

    if (projectData && isWeakCtoMessage(ctoResult.output.statusUpdate)) {
      ctoResult.output.statusUpdate = buildCtoFallbackMessage(projectData, intent, orchestrationResult?.agentResponses || []);
    }

    return NextResponse.json({
      projectId: currentProjectId,
      message: ctoResult.output.statusUpdate || orchestrationResult?.message || 'Processing...',
      agentResponses: [mapAgentResponse(ctoResult, intent)],
      projectStatus: updatedState?.status || 'building',
      liveUrl: updatedState?.liveUrl || undefined,
      cycleCount: updatedState?.totalCycles,
      phase: updatedState?.status,
      qaGateResult: orchestrationResult?.qaGateResult,
    });
  } catch (error: any) {
    console.error('[AION Chat API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

function detectUserIntent(message: string): string {
  const lower = message.toLowerCase().trim();

  if (isGreetingMessage(lower)) {
    return 'greeting';
  }

  if (/^(how|what|where|status|progress|update|how's|whats|what's)/.test(lower) &&
      /(going|progress|status|happening|doing|build|project|app)/.test(lower)) {
    return 'status_check';
  }

  if (/^(continue|keep going|go ahead|proceed|run|execute|next|build it|ship it|keep building|auto|start)/.test(lower)) {
    return 'continue_build';
  }

  if (/^(change|update|modify|add|remove|delete|replace|switch|move|rename|redo)/.test(lower) ||
      /(instead|rather|different|another way|new approach)/.test(lower)) {
    return 'change_request';
  }

  if (/\?$/.test(lower) || /^(why|how does|can we|should we|is it|would it|do you)/.test(lower)) {
    return 'question';
  }

  if (/(test|qa|quality|bug|check|verify|validate|gate)/.test(lower)) {
    return 'qa_query';
  }

  if (/(prd|feature|requirement|scope|mvp|user stor|product|roadmap|priorit)/.test(lower) ||
      /(revise prd|update prd|change prd|add feature|remove feature|cut feature)/.test(lower)) {
    return 'prd_query';
  }

  if (/(just skip|don't need|simple|quick|hack|workaround|shortcut|bypass|skip test|skip qa|no qa)/.test(lower)) {
    return 'push_back_test';
  }

  return 'general';
}

function detectInitialIntent(message: string): 'greeting' | 'kickoff' {
  const normalized = message.toLowerCase().trim();
  if (isGreetingMessage(normalized) || normalized.split(/\s+/).length <= 2) {
    return 'greeting';
  }
  return 'kickoff';
}

async function safeKickoffProject(projectId: string, message: string): Promise<OrchestratorResult> {
  try {
    return await Promise.race([
      kickoffProject(projectId, message),
      new Promise<OrchestratorResult>((_, reject) =>
        setTimeout(() => reject(new Error('Project kickoff timed out - try continuing with Auto Build')), 55000)
      ),
    ]);
  } catch (error: any) {
    console.error('[AION Chat API] Kickoff fallback engaged:', error.message);
    const seededTasks = buildSeedTasksFromIdea(message);

    if (seededTasks.length > 0) {
      await boardManager.createTasks(projectId, seededTasks.map(task => ({
        taskDescription: task.taskDescription,
        assignedTo: task.assignedTo,
        priority: task.priority,
        phase: task.phase,
      })));
      await boardManager.updateStatus(projectId, 'building');
    }

    return {
      success: true,
      message: 'Kickoff fallback generated from local rules.',
      agentResponses: [{
        agentId: 'cto',
        taskId: 'cto-kickoff-fallback',
        status: 'success',
        output: {
          analysis: `AI kickoff failed, so AION generated a deterministic v1 plan from the request. Root error: ${error.message}`,
          statusUpdate: `Here is the call: ${inferProjectName(message)} is worth building, but we keep v1 narrow. I could not get a stable planning response from the model layer, so I seeded the initial execution path myself and kept the project moving. Immediate next move: attach a repo workspace, validate the execution lane, and build around repo control, approvals, and operator visibility first.`,
          taskAssignments: seededTasks,
          nextSteps: [
            'Attach the first workspace',
            'Validate command and repo execution',
            'Refine scope once the execution lane is stable',
          ],
        },
        confidence: 0.62,
      }],
      projectStatus: 'building',
      phase: 'planning',
    };
  }
}

async function safeCtoConverse(
  message: string,
  conversationHistory: string,
  projectContext: string,
  projectData: any,
  intent: string
) {
  try {
    return await ctoAgent.converse(message, conversationHistory, projectContext);
  } catch (error: any) {
    console.error('[AION Chat API] CTO fallback engaged:', error.message);
    return {
      agentId: 'cto',
      taskId: 'cto-conversation-fallback',
      status: 'success',
      output: {
        analysis: `AI conversation failed, so the Lead CTO answered from live project state. Root error: ${error.message}`,
        statusUpdate: buildCtoFallbackMessage(projectData, intent),
        nextSteps: ['Keep the current execution lane moving', 'Retry higher-context planning after the provider layer recovers'],
      },
      confidence: 0.58,
    };
  }
}

function buildSeedTasksFromIdea(message: string) {
  const normalized = message.toLowerCase();
  const baseTasks: Array<{
    taskDescription: string;
    assignedTo: 'business' | 'frontend' | 'backend' | 'qa' | 'devops' | 'research';
    priority: 'critical' | 'high' | 'medium';
    phase: 'plan' | 'build' | 'test';
    context: string;
  }> = [
    {
      taskDescription: 'Define the narrow v1 and confirm the execution boundary',
      assignedTo: 'business' as const,
      priority: 'critical' as const,
      phase: 'plan' as const,
      context: 'Convert the user request into a hard-scoped MVP with explicit in/out boundaries.',
    },
    {
      taskDescription: 'Attach the first workspace and verify repo-safe execution',
      assignedTo: 'devops' as const,
      priority: 'critical' as const,
      phase: 'build' as const,
      context: 'Set up the trusted execution lane for commands, git, and artifacts.',
    },
    {
      taskDescription: 'Build the control-plane API and approval path for repo actions',
      assignedTo: 'backend' as const,
      priority: 'high' as const,
      phase: 'build' as const,
      context: 'Focus on repo control, approvals, and execution visibility before broadening scope.',
    },
    {
      taskDescription: 'Build the phone-first operator shell for the control plane',
      assignedTo: 'frontend' as const,
      priority: 'high' as const,
      phase: 'build' as const,
      context: 'Keep the lead voice dominant and surface only the highest-signal controls.',
    },
    {
      taskDescription: 'Validate the execution lane and approval flow before any deploy',
      assignedTo: 'qa' as const,
      priority: 'critical' as const,
      phase: 'test' as const,
      context: 'Confirm that repo actions, commands, and approvals behave reliably.',
    },
  ];

  if (normalized.includes('browser') || normalized.includes('url')) {
    baseTasks.splice(4, 0, {
      taskDescription: 'Add browser-run reporting for public URL inspection',
      assignedTo: 'research' as const,
      priority: 'medium' as const,
      phase: 'build' as const,
      context: 'Keep browser support lightweight until the repo execution core is stable.',
    });
  }

  return baseTasks;
}

function isGreetingMessage(normalized: string): boolean {
  return /^(hi|hey|hello|yo|sup|what's up|whats up|good morning|good afternoon|good evening)$/.test(normalized);
}

function inferProjectName(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New AION Project';
  if (cleaned.length <= 50) return cleaned;
  return `${cleaned.slice(0, 47).trim()}...`;
}

function buildGreetingResponse(message: string): { statusUpdate: string; analysis: string } {
  const normalized = message.trim().toLowerCase();

  if (normalized === 'hey' || normalized === 'hi' || normalized === 'hello') {
    return {
      statusUpdate: 'I’m here. Bring me the product, repo, or problem. If you already know the outcome you want, say it plainly and I’ll make the call.',
      analysis: 'Handled as greeting-only lead response. No project initialized.',
    };
  }

  return {
    statusUpdate: 'I’m ready. Give me the build, the repo, or the failure point you want handled, and I’ll tell you the right first move.',
    analysis: 'Handled as lightweight pre-kickoff lead response. No project initialized.',
  };
}

function mapAgentResponse(response: any, intent: string) {
  return {
    agentId: response.agentId,
    status: response.status,
    statusUpdate: response.output.statusUpdate,
    analysis: response.output.analysis?.substring(0, 500),
    confidence: response.confidence,
    taskAssignments: response.output.taskAssignments,
    filesCount: response.output.files?.length || 0,
    bugsCount: response.output.bugs?.length || 0,
    testResultsCount: response.output.testResults?.length || 0,
    qaGateResult: response.output.qaGateResult,
    actionType: response.agentId === 'cto' ? intent : undefined,
  };
}

function summarizeOrchestration(responses: any[]): string | null {
  const specialistResponses = responses.filter(response => response.agentId !== 'cto');
  if (specialistResponses.length === 0) return null;

  const summary = specialistResponses
    .slice(0, 2)
    .map(response => {
      const status = response.output?.statusUpdate || response.output?.analysis || 'completed a step';
      return `${response.agentId} ${status}`;
    })
    .join('. ');

  return `Execution update: ${summary}.`;
}

function isWeakCtoMessage(message?: string | null): boolean {
  if (!message) return true;

  const normalized = message.trim().toLowerCase();
  if (normalized.length < 60) return true;

  return (
    normalized.includes('planning phase') ||
    normalized.includes('prd needs to be completed') ||
    normalized.includes('before proceeding') ||
    normalized.includes('currently in the planning phase') ||
    normalized.startsWith('the project is currently in the') ||
    normalized.includes('the next move is to attach the first workspace') ||
    normalized === 'prd created'
  );
}

function buildCtoFallbackMessage(project: any, intent: string, specialistResponses: any[] = []): string {
  const totalTasks = project.tasks?.length || 0;
  const pendingTasks = project.tasks?.filter((task: any) => task.status === 'pending').length || 0;
  const completedTasks = project.tasks?.filter((task: any) => task.status === 'done').length || 0;
  const activeTasks = project.tasks?.filter((task: any) => task.status === 'in_progress' || task.status === 'review').length || 0;
  const pendingApprovals = project.approvals?.filter((approval: any) => approval.status === 'pending').length || 0;
  const activeRuns = project.runs?.filter((run: any) => run.status === 'queued' || run.status === 'running').length || 0;
  const workspaceNames = (project.workspaces || []).map((workspace: any) => workspace.name).slice(0, 3);
  const specialistSummary = summarizeOrchestration(specialistResponses);

  if (intent === 'kickoff') {
    return [
      `Here is the call: ${project.name} is viable, but v1 stays narrow.`,
      `I have ${totalTasks} tasks queued and the project is already in ${project.status}.`,
      workspaceNames.length > 0
        ? `Execution lanes are set up for ${workspaceNames.join(', ')}.`
        : 'The next move is attaching the first workspace so execution has somewhere real to run.',
      'Immediate next move: keep the MVP centered on repo control, approvals, and execution visibility instead of expanding the surface area.',
    ].join(' ');
  }

  return [
    `Here is the real call: the project is ${project.status}.`,
    `${completedTasks}/${totalTasks} tasks are done, ${activeTasks} are active, ${pendingTasks} are queued, and ${activeRuns} execution run${activeRuns === 1 ? '' : 's'} are moving.`,
    pendingApprovals > 0
      ? `${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} are waiting, so that is the main control point right now.`
      : 'There is no approval bottleneck right now.',
    workspaceNames.length > 0
      ? `Operational lanes: ${workspaceNames.join(', ')}.`
      : 'No repo workspace is attached yet, so repo execution is still the next practical unlock.',
    specialistSummary || '',
    'Next move: clear the highest-value blocker and keep the scope disciplined.',
  ].filter(Boolean).join(' ');
}
