// AION Health Check Endpoint
// Used by deployment platforms (Render, Vercel) to verify the app is running.
// Also provides AI router status for debugging.

import { NextResponse } from 'next/server';
import { getRouterStatus } from '@/lib/integrations/ai-sdk';
import type { RouterStatus } from '@/lib/integrations/ai-router';

export async function GET() {
  let routerStatus: RouterStatus | null = null;
  try {
    routerStatus = getRouterStatus();
  } catch {
    // Router might not be initialized yet
  }

  return NextResponse.json({
    status: 'ok',
    service: 'AION — Autonomous Intelligent Orchestration Network',
    timestamp: new Date().toISOString(),
    version: '0.3.0',
    ai: routerStatus ? {
      providers: routerStatus.providers,
      endpoints: `${routerStatus.healthyEndpoints}/${routerStatus.totalEndpoints} healthy`,
      tierHealth: {
        heavy: `${routerStatus.tierStatus.heavy.available}/${routerStatus.tierStatus.heavy.total} available`,
        medium: `${routerStatus.tierStatus.medium.available}/${routerStatus.tierStatus.medium.total} available`,
        light: `${routerStatus.tierStatus.light.available}/${routerStatus.tierStatus.light.total} available`,
      },
      totalCalls: routerStatus.totalCalls,
      totalFailures: routerStatus.totalFailures,
    } : 'not_initialized',
  });
}
