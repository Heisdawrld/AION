import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';
import type { ApprovalType, RiskLevel } from '@/lib/types/aion';

function inferApproval(command?: string): {
  approvalRequired: boolean;
  approvalType?: ApprovalType;
  riskLevel?: RiskLevel;
  summary?: string;
} {
  if (!command) {
    return { approvalRequired: false };
  }

  const normalized = command.trim().toLowerCase();

  if (/\bgit\s+push\b/.test(normalized)) {
    return {
      approvalRequired: true,
      approvalType: 'git_push',
      riskLevel: 'high',
      summary: 'Approve git push',
    };
  }

  if (/\brm\s+(-rf?|-fr?)\b/.test(normalized)) {
    return {
      approvalRequired: true,
      approvalType: 'destructive_command',
      riskLevel: 'high',
      summary: 'Approve destructive command',
    };
  }

  return { approvalRequired: false };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const workspaceId = searchParams.get('workspaceId') || undefined;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const runs = await boardManager.listRuns(projectId, workspaceId);
    return NextResponse.json(runs);
  } catch (error: any) {
    console.error('[AION Run API] GET Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      workspaceId,
      agentRole,
      kind,
      summary,
      command,
      requestedBy,
      approvalRequired,
    } = body;

    if (!projectId || !kind || !summary) {
      return NextResponse.json(
        { error: 'projectId, kind, and summary are required' },
        { status: 400 }
      );
    }

    const inferred = inferApproval(command);
    const requiresApproval = Boolean(approvalRequired) || inferred.approvalRequired;

    const runId = await boardManager.createRun(projectId, {
      workspaceId,
      agentRole,
      kind,
      status: requiresApproval ? 'awaiting_approval' : 'queued',
      summary,
      command,
      requestedBy,
      approvalRequired: requiresApproval,
    });

    if (requiresApproval) {
      await boardManager.createApprovalRequest(projectId, {
        workspaceId,
        runId,
        type: inferred.approvalType ?? 'destructive_command',
        riskLevel: inferred.riskLevel ?? 'high',
        summary: inferred.summary ?? summary,
        commandPreview: command,
        requestedBy,
      });
    }

    return NextResponse.json({
      runId,
      message: requiresApproval ? 'Run queued and waiting for approval' : 'Run queued',
      requiresApproval,
    });
  } catch (error: any) {
    console.error('[AION Run API] POST Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
