// AION — Chat API Route
// Main endpoint for user interaction with the AION system

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { kickoffProject, runOrchestrationStep } from '@/lib/engine/orchestrator';

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

    // If no project ID, create a new project
    let currentProjectId = projectId;
    if (!currentProjectId) {
      currentProjectId = await boardManager.createProject(
        message.substring(0, 50),
        message
      );

      // Kick off the project with the user's idea
      const result = await kickoffProject(currentProjectId, message);

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
        })),
        projectStatus: result.projectStatus,
        liveUrl: result.liveUrl,
      });
    }

    // If project exists, run the next orchestration step
    const result = await runOrchestrationStep(currentProjectId);

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
      })),
      projectStatus: result.projectStatus,
      liveUrl: result.liveUrl,
    });
  } catch (error: any) {
    console.error('[AION Chat API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
