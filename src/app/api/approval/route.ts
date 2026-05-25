import { NextRequest, NextResponse } from 'next/server';
import { boardManager } from '@/lib/engine/board-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const workspaceId = searchParams.get('workspaceId') || undefined;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const approvals = await boardManager.listApprovalRequests(projectId, workspaceId);
    return NextResponse.json(approvals);
  } catch (error: any) {
    console.error('[AION Approval API] GET Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, runId, status, decidedBy, decisionReason } = body;

    if (!approvalId || !status) {
      return NextResponse.json({ error: 'approvalId and status are required' }, { status: 400 });
    }

    if (!['approved', 'rejected', 'expired', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid approval status' }, { status: 400 });
    }

    await boardManager.updateApprovalRequest(approvalId, {
      status,
      decidedBy: decidedBy ?? 'user',
      decisionReason: decisionReason ?? null,
      decidedAt: status === 'approved' || status === 'rejected' ? new Date() : null,
    });

    if (runId && status === 'approved') {
      await boardManager.updateRun(runId, { status: 'queued' });
    }

    if (runId && status === 'rejected') {
      await boardManager.updateRun(runId, {
        status: 'cancelled',
        error: decisionReason ?? 'Rejected by user',
        completedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, message: 'Approval updated' });
  } catch (error: any) {
    console.error('[AION Approval API] POST Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
