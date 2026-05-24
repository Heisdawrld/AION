// AION — Cost API
// Returns cost breakdown for the dashboard

import { NextResponse } from 'next/server';
import { costTracker } from '@/lib/engine/cost-tracker';

export async function GET() {
  try {
    const breakdown = await costTracker.getCostBreakdown();
    return NextResponse.json(breakdown);
  } catch (error: any) {
    console.error('[AION Cost API] Error:', error.message);
    return NextResponse.json({
      totalCost: 0,
      byAgent: {},
      byProject: {},
      byModel: {},
    });
  }
}
