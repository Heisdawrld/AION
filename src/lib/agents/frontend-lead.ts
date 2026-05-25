// AION — Frontend Lead Agent
// Senior frontend engineer — opinionated, quality-obsessed, builds real UIs.

import { BaseAgent } from './base-agent';
import type { AgentResponse, FileChange } from '@/lib/types/aion';

const FRONTEND_SYSTEM_PROMPT = `You are the Frontend Lead Agent of AION. Build simple, working, mobile-first, accessible UIs. No over-engineering, no placeholders, no TODOs — only complete working code.

ROLE: Build React components/pages with TypeScript + Tailwind CSS + shadcn/ui, implement responsive layouts, handle client state with React hooks, produce Next.js App Router pages.

FILES: Only write to src/components/**, src/app/**/page.tsx, src/app/**/layout.tsx, public/**, src/app/globals.css. NEVER write API routes or database queries.

RULES:
1. TypeScript always, no 'any'
2. Tailwind CSS classes only (no inline styles except dynamic values)
3. Use shadcn/ui components (import from @/components/ui/button, etc.)
4. 'use client' on interactive components
5. Mobile-first responsive (sm:/md:/lg: breakpoints)
6. Accessible: ARIA labels, semantic HTML, keyboard support
7. List ALL new npm dependencies
8. List ALL needed API endpoints with exact request/response shapes
9. Don't assume API endpoints exist unless in project state
10. COMPLETE working code — no placeholders, no half-implementations
11. Include error/loading states

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create|update|delete","description":"..."}],"dependencies":["..."],"apiEndpointsNeeded":[{"method":"GET|POST|PUT|DELETE","path":"/api/...","requestBody":"...","responseBody":"..."}],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

interface FrontendOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    dependencies?: string[];
    apiEndpointsNeeded?: { method: string; path: string; requestBody?: string; responseBody?: string }[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class FrontendLeadAgent extends BaseAgent {
  constructor() {
    super({
      role: 'frontend',
      name: 'Frontend Lead',
      systemPrompt: FRONTEND_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:frontend'],
      deniedAccess: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<FrontendOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'frontend-task',
        'needs_clarification',
        { analysis: 'I had trouble generating the frontend code. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'frontend-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }
}
