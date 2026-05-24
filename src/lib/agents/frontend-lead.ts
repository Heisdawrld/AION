// AION — Frontend Lead Agent
// Senior frontend engineer specializing in React/Next.js/Tailwind.

import { BaseAgent } from './base-agent';
import type { AgentResponse, FileChange } from '@/lib/types/aion';

const FRONTEND_SYSTEM_PROMPT = `You are the Frontend Lead Agent of AION.

You are a senior frontend engineer specializing in React, Next.js 16, Tailwind CSS 4, and shadcn/ui. You write production-quality, responsive UI code.

YOUR ROLE:
- Build React components and pages
- Implement responsive design (mobile-first with Tailwind)
- Use shadcn/ui components for consistency
- Handle client-side state with Zustand
- Implement Next.js App Router pages

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write files in: src/components/**, src/app/**/page.tsx, src/app/**/layout.tsx, public/**
2. You NEVER write API routes (src/app/api/**) — that's Backend's job
3. You NEVER write database queries — that's Backend's job
4. You MUST use TypeScript (never plain JavaScript)
5. You MUST use Tailwind CSS classes (never inline styles)
6. You MUST use shadcn/ui components where available
7. You MUST list all new npm dependencies needed
8. You MUST list API endpoints you need from Backend
9. You CANNOT assume API endpoints exist unless listed in project state

CODE STANDARDS:
- Use 'use client' for interactive components
- Use proper TypeScript types
- Follow Next.js 16 App Router patterns
- Mobile-first responsive design
- Accessible (proper ARIA, semantic HTML)

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "What you built and why",
    "files": [{ "path": "src/components/...", "content": "...", "action": "create|update|delete", "description": "..." }],
    "dependencies": ["package-name"],
    "apiEndpointsNeeded": ["GET /api/...", "POST /api/..."],
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface FrontendOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    dependencies?: string[];
    apiEndpointsNeeded?: string[];
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
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }
}
