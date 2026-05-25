import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      runId,
      status,
      output,
      error,
      completedAt,
      artifacts,
      workspaceUpdate,
    } = body;

    if (!runId || !status) {
      return NextResponse.json({ error: 'runId and status are required' }, { status: 400 });
    }

    const normalizedStatus = status === 'completed' ? 'completed' : 'failed';

    await boardManager.updateRun(runId, {
      status: normalizedStatus,
      output: output ?? null,
      error: error ?? null,
      completedAt: completedAt ? new Date(completedAt) : new Date(),
    });

    const run = await boardManager.getRun(runId);
    if (run && workspaceUpdate && run.workspaceId) {
      await boardManager.updateWorkspace(run.workspaceId, {
        currentBranch: workspaceUpdate.currentBranch ?? undefined,
        defaultBranch: workspaceUpdate.defaultBranch ?? undefined,
        status: workspaceUpdate.status ?? undefined,
        lastSyncedAt: workspaceUpdate.lastSyncedAt ? new Date(workspaceUpdate.lastSyncedAt) : undefined,
      });
    }

    if (Array.isArray(artifacts) && run) {
      if (run) {
        for (const artifact of artifacts) {
          await boardManager.createArtifact(run.projectId, {
            workspaceId: run.workspaceId ?? undefined,
            runId,
            kind: artifact.kind,
            title: artifact.title,
            path: artifact.path,
            contentType: artifact.contentType,
            content: artifact.content,
            metadata: artifact.metadata,
            sizeBytes: artifact.sizeBytes,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[AION Worker Report API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
