// AION — SSE Streaming Endpoint
// Streams AutonomousProgressEvent data during orchestration via Server-Sent Events.
// This replaces the "wait for entire cycle" UX with real-time progress.

import { NextRequest } from 'next/server';
import { runAutonomousCycle } from '@/lib/engine/orchestrator';
import type { AutonomousProgressEvent } from '@/lib/engine/orchestrator';

export const dynamic = 'force-dynamic';

// Vercel serverless function timeout
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const steps = parseInt(searchParams.get('steps') || '5', 10);

  if (!projectId) {
    return new Response(
      JSON.stringify({ error: 'projectId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE events
      const sendEvent = (event: AutonomousProgressEvent) => {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (e) {
          // Controller may be closed
        }
      };

      // Send a heartbeat every 15 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      try {
        // Run the autonomous cycle with progress callback
        const result = await runAutonomousCycle(projectId, steps, (event) => {
          sendEvent(event);
        });

        // Send the final completion event
        sendEvent({
          type: 'complete',
          stepNumber: steps,
          totalSteps: steps,
          message: result.message,
          timestamp: new Date().toISOString(),
          data: {
            success: result.success,
            projectStatus: result.projectStatus,
            liveUrl: result.liveUrl,
            cycleCount: result.cycleCount,
            phase: result.phase,
          },
        });
      } catch (error: any) {
        // Send error event
        sendEvent({
          type: 'error',
          stepNumber: 0,
          message: error.message || 'Internal server error during orchestration',
          timestamp: new Date().toISOString(),
        });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
