// AION Health Check Endpoint
// Used by deployment platforms (Render, Vercel) to verify the app is running.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'AION — Autonomous Intelligent Orchestration Network',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
  });
}
