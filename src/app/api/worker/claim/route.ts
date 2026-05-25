import { NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { workspaceManager } from '@/lib/engine/workspace-manager';

export async function POST() {
  try {
    const run = await boardManager.claimNextQueuedRun();

    if (!run) {
      return NextResponse.json({ run: null });
    }

    const workspace = run.workspaceId
      ? await boardManager.getWorkspace(run.workspaceId)
      : null;
    const workspacePath = workspace
      ? workspaceManager.getRepoWorkspacePath(workspace.id, workspace.rootPath)
      : null;

    return NextResponse.json({
      run,
      workspace,
      workspacePath,
    });
  } catch (error: any) {
    console.error('[AION Worker Claim API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
