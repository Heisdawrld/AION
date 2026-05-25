import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { workspaceManager } from '@/lib/engine/workspace-manager';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const workspaces = await boardManager.listWorkspaces(projectId);
    return NextResponse.json(workspaces);
  } catch (error: any) {
    console.error('[AION Workspace API] GET Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      name,
      repoUrl,
      repoProvider,
      defaultBranch,
      currentBranch,
      rootPath,
      isPrimary,
    } = body;

    if (!projectId || !name) {
      return NextResponse.json({ error: 'projectId and name are required' }, { status: 400 });
    }

    const workspaceId = await boardManager.createWorkspace(projectId, {
      name,
      slug: slugify(name),
      repoUrl,
      repoProvider,
      defaultBranch,
      currentBranch,
      rootPath: rootPath || undefined,
      status: repoUrl ? 'syncing' : 'ready',
      isPrimary: Boolean(isPrimary),
    });

    await workspaceManager.createRepoWorkspace(workspaceId, rootPath || workspaceId);
    const workspace = await boardManager.getWorkspace(workspaceId);
    let runId: string | null = null;

    if (repoUrl) {
      runId = await boardManager.createRun(projectId, {
        workspaceId,
        kind: 'git',
        status: 'queued',
        summary: `Clone repository into ${name}`,
        command: 'git clone __REPO_URL__ .',
        requestedBy: 'user',
        approvalRequired: false,
      });
    }

    return NextResponse.json({
      workspaceId,
      workspace,
      runId,
      message: repoUrl ? 'Workspace created and clone queued' : 'Workspace created',
    });
  } catch (error: any) {
    console.error('[AION Workspace API] POST Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
