// AION - Terminal API Route
// Queues terminal commands for worker execution and exposes workspace files.

import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import { workspaceManager } from '@/lib/engine/workspace-manager';

export const maxDuration = 30;

function isServerless(): boolean {
  return process.env.VERCEL === '1';
}

const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  'format',
  'del /f /s /q C:',
  'rd /s /q C:',
];

const SENSITIVE_PATTERNS = [
  /\brm\s+(-rf?|-fr?)\s+[^.]/,
  /\bgit\s+push\s+--force/,
  /\bnpm\s+publish/,
  /\bdocker\s+rm/,
  /\bkubectl\s+delete/,
];

const MAX_OUTPUT_LENGTH = 100_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, workspaceId, command } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'command is required and must be a string' }, { status: 400 });
    }

    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return NextResponse.json({ error: 'command cannot be empty' }, { status: 400 });
    }

    const lowerCommand = trimmedCommand.toLowerCase();
    for (const blocked of BLOCKED_COMMANDS) {
      if (lowerCommand.includes(blocked.toLowerCase())) {
        return NextResponse.json({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `Command blocked for safety: "${blocked}" is not allowed.`,
          duration: 0,
          blocked: true,
        });
      }
    }

    const approvalRequired = SENSITIVE_PATTERNS.some(pattern => pattern.test(trimmedCommand));

    let targetWorkspace = workspaceId
      ? await boardManager.getWorkspace(workspaceId)
      : await boardManager.getPrimaryWorkspace(projectId);

    if (!targetWorkspace) {
      const createdWorkspaceId = await boardManager.createWorkspace(projectId, {
        name: 'Primary Workspace',
        slug: 'primary',
        rootPath: projectId,
        status: 'ready',
        isPrimary: true,
      });
      await workspaceManager.createRepoWorkspace(createdWorkspaceId, projectId);
      targetWorkspace = await boardManager.getWorkspace(createdWorkspaceId);
    }

    if (!targetWorkspace) {
      return NextResponse.json(
        { error: 'Unable to resolve a workspace for terminal execution.' },
        { status: 500 }
      );
    }

    const workspacePath = workspaceManager.getRepoWorkspacePath(
      targetWorkspace.id,
      targetWorkspace.rootPath
    );

    await workspaceManager.createRepoWorkspace(
      targetWorkspace.id,
      targetWorkspace.rootPath ?? targetWorkspace.id
    );

    const runId = await boardManager.createRun(projectId, {
      workspaceId: targetWorkspace.id,
      kind: 'command',
      status: approvalRequired ? 'awaiting_approval' : 'queued',
      summary: `Terminal command: ${trimmedCommand}`,
      command: trimmedCommand,
      requestedBy: 'user',
      approvalRequired,
    });

    if (approvalRequired) {
      await boardManager.createApprovalRequest(projectId, {
        workspaceId: targetWorkspace.id,
        runId,
        type: 'destructive_command',
        riskLevel: 'high',
        summary: `Approve terminal command in ${targetWorkspace.name}`,
        commandPreview: trimmedCommand,
        requestedBy: 'user',
      });
    }

    return NextResponse.json({
      success: true,
      queued: true,
      runId,
      workspaceId: targetWorkspace.id,
      workspacePath,
      requiresApproval: approvalRequired,
      exitCode: 0,
      stdout: approvalRequired
        ? `Command queued and waiting for approval: ${trimmedCommand}`
        : `Command queued for worker execution: ${trimmedCommand}`,
      stderr: '',
      duration: 0,
      serverless: isServerless(),
      command: trimmedCommand,
      outputLimit: MAX_OUTPUT_LENGTH,
    });
  } catch (error: any) {
    console.error('[AION Terminal API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const workspaceId = searchParams.get('workspaceId');
    const dirPath = searchParams.get('path') || '';

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const targetWorkspace = workspaceId
      ? await boardManager.getWorkspace(workspaceId)
      : await boardManager.getPrimaryWorkspace(projectId);

    if (!targetWorkspace) {
      return NextResponse.json({
        files: [],
        workspacePath: null,
        exists: false,
      });
    }

    const workspacePath = workspaceManager.getRepoWorkspacePath(
      targetWorkspace.id,
      targetWorkspace.rootPath
    );

    let exists = false;
    try {
      const info = await workspaceManager.getRepoWorkspaceInfo(targetWorkspace.id);
      exists = info?.existsOnDisk ?? false;
    } catch {}

    if (!exists) {
      return NextResponse.json({
        files: [],
        workspacePath,
        exists: false,
        workspace: targetWorkspace,
      });
    }

    const relativeDir = dirPath === '' ? '' : dirPath;
    const files = await workspaceManager.listFilesAtPath(workspacePath, relativeDir);

    return NextResponse.json({
      files,
      workspacePath,
      exists: true,
      workspace: targetWorkspace,
    });
  } catch (error: any) {
    console.error('[AION Terminal API] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
