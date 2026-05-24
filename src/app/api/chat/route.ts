// AION — Chat API Route (Enhanced with Conversational CTO)
// Main endpoint for user interaction with the AION system
// Now supports:
// 1. New project creation → CTO kicks off with bold assessment
// 2. Follow-up conversations → CTO responds conversationally, pushes back, goes extra
// 3. Agent activity broadcasts → CTO tells user what agents are doing

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { kickoffProject, runOrchestrationStep, processAgentResponse } from '@/lib/engine/orchestrator';
import { LeadCTOAgent } from '@/lib/agents/lead-cto';

const ctoAgent = new LeadCTOAgent();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, projectId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // ========================================
    // CASE 1: No project yet → Create new project + kickoff
    // ========================================
    let currentProjectId = projectId;
    if (!currentProjectId) {
      currentProjectId = await boardManager.createProject(
        message.substring(0, 50),
        message
      );

      // Save user's message to conversation history
      await boardManager.saveConversationMessage(currentProjectId, {
        role: 'user',
        content: message,
      });

      // Kick off the project with the user's idea
      const result = await kickoffProject(currentProjectId, message);

      // Save CTO's response to conversation history
      const ctoResponse = result.agentResponses.find(r => r.agentId === 'cto');
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

      // Save business agent's response too
      const bizResponse = result.agentResponses.find(r => r.agentId === 'business');
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
        message: result.message,
        agentResponses: result.agentResponses.map(r => ({
          agentId: r.agentId,
          status: r.status,
          statusUpdate: r.output.statusUpdate,
          analysis: r.output.analysis?.substring(0, 500),
          confidence: r.confidence,
          taskAssignments: r.output.taskAssignments,
          filesCount: r.output.files?.length || 0,
        })),
        projectStatus: result.projectStatus,
        liveUrl: result.liveUrl,
        phase: result.phase,
      });
    }

    // ========================================
    // CASE 2: Project exists → CTO CONVERSATIONAL MODE
    // The CTO talks to the user like a real partner.
    // It can push back, suggest alternatives, update plans, or just chat.
    // ========================================

    // Save user's message
    await boardManager.saveConversationMessage(currentProjectId, {
      role: 'user',
      content: message,
    });

    // Get conversation history for context
    const conversationHistory = await boardManager.buildConversationContext(currentProjectId, 20);

    // Get current project state
    const projectContext = await boardManager.buildAgentContext(currentProjectId, 'cto');

    // Determine the user's intent
    const intent = detectUserIntent(message);

    let ctoResult;
    let orchestrationResult = null;

    switch (intent) {
      case 'status_check': {
        // User is asking about progress → CTO gives a status update
        ctoResult = await ctoAgent.converse(message, conversationHistory, projectContext);
        break;
      }

      case 'change_request': {
        // User wants to change something → CTO evaluates and responds
        ctoResult = await ctoAgent.converse(message, conversationHistory, projectContext);

        // If CTO approved new tasks from the change request, process them
        if (ctoResult.output.taskAssignments && ctoResult.output.taskAssignments.length > 0) {
          await boardManager.createTasks(currentProjectId, ctoResult.output.taskAssignments.map(ta => ({
            taskDescription: ta.taskDescription,
            assignedTo: ta.assignedTo,
            priority: ta.priority,
            phase: ta.phase,
          })));
        }
        break;
      }

      case 'continue_build': {
        // User wants to continue building → run orchestration steps
        ctoResult = await ctoAgent.converse(
          `The user wants to continue building. Give them a quick update on where we are and what's about to happen next.`,
          conversationHistory,
          projectContext
        );

        // Also run an orchestration step
        orchestrationResult = await runOrchestrationStep(currentProjectId);
        break;
      }

      case 'question': {
        // User is asking a question → CTO answers conversationally
        ctoResult = await ctoAgent.converse(message, conversationHistory, projectContext);
        break;
      }

      case 'push_back_test': {
        // User is suggesting something potentially problematic → CTO evaluates honestly
        ctoResult = await ctoAgent.converse(message, conversationHistory, projectContext);
        break;
      }

      default: {
        // General conversation → CTO responds with full personality
        ctoResult = await ctoAgent.converse(message, conversationHistory, projectContext);
        break;
      }
    }

    // Save CTO's response to conversation history
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

    // Process any new tasks from CTO
    if (ctoResult.output.taskAssignments && ctoResult.output.taskAssignments.length > 0) {
      await boardManager.createTasks(currentProjectId, ctoResult.output.taskAssignments.map(ta => ({
        taskDescription: ta.taskDescription,
        assignedTo: ta.assignedTo,
        priority: ta.priority,
        phase: ta.phase,
      })));

      // Log CTO activity
      await boardManager.logAgentActivity(currentProjectId, {
        agentRole: 'cto',
        action: 'create_tasks_from_conversation',
        task: `Created ${ctoResult.output.taskAssignments.length} tasks from user conversation`,
        confidence: ctoResult.confidence,
        output: ctoResult.output,
      });
    }

    // Build the response
    const allAgentResponses = [ctoResult];

    // If orchestration also ran, include those responses
    if (orchestrationResult) {
      allAgentResponses.push(...orchestrationResult.agentResponses);

      // Save orchestration agent responses to conversation
      for (const resp of orchestrationResult.agentResponses) {
        if (resp.output.statusUpdate) {
          await boardManager.saveConversationMessage(currentProjectId, {
            role: 'system',
            content: resp.output.statusUpdate,
            agentRole: resp.agentId,
            metadata: { confidence: resp.confidence },
          });
        }
      }
    }

    // Get updated project status
    const updatedState = await boardManager.getProjectState(currentProjectId);

    return NextResponse.json({
      projectId: currentProjectId,
      message: ctoResult.output.statusUpdate || orchestrationResult?.message || 'Processing...',
      agentResponses: allAgentResponses.map(r => ({
        agentId: r.agentId,
        status: r.status,
        statusUpdate: r.output.statusUpdate,
        analysis: r.output.analysis?.substring(0, 500),
        confidence: r.confidence,
        taskAssignments: r.output.taskAssignments,
        filesCount: r.output.files?.length || 0,
        bugsCount: r.output.bugs?.length || 0,
        actionType: r.agentId === 'cto' ? intent : undefined,
      })),
      projectStatus: updatedState?.status || 'building',
      liveUrl: updatedState?.liveUrl || undefined,
      cycleCount: updatedState?.totalCycles,
      phase: updatedState?.status,
    });
  } catch (error: any) {
    console.error('[AION Chat API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Detect what the user is trying to do based on their message.
 * This helps route to the right CTO behavior.
 */
function detectUserIntent(message: string): string {
  const lower = message.toLowerCase().trim();

  // Status checks
  if (/^(how|what|where|status|progress|update|how's|whats|what's)/.test(lower) &&
      /(going|progress|status|happening|doing|build|project|app)/.test(lower)) {
    return 'status_check';
  }

  // Continue/resume building
  if (/^(continue|keep going|go ahead|proceed|run|execute|next|build it|ship it|keep building|auto|start)/.test(lower)) {
    return 'continue_build';
  }

  // Change requests
  if (/^(change|update|modify|add|remove|delete|replace|switch|move|rename|redo)/.test(lower) ||
      /(instead|rather|different|another way|new approach)/.test(lower)) {
    return 'change_request';
  }

  // Questions about technical decisions
  if (/\?$/.test(lower) || /^(why|how does|can we|should we|is it|would it|do you)/.test(lower)) {
    return 'question';
  }

  // User suggesting something that might need push-back
  if (/(just skip|don't need|simple|quick|hack|workaround|shortcut|bypass)/.test(lower)) {
    return 'push_back_test';
  }

  // Default: general conversation
  return 'general';
}
