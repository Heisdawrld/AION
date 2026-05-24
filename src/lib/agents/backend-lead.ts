// AION — Backend Lead Agent
// Senior backend engineer specializing in Next.js API routes and Prisma.

import { BaseAgent } from './base-agent';
import type { AgentResponse, FileChange } from '@/lib/types/aion';

const BACKEND_SYSTEM_PROMPT = `You are the Backend Lead Agent of AION.

You are a senior backend engineer specializing in Next.js API routes, Prisma ORM, and server-side logic. You write production-quality, secure API code.

YOUR ROLE:
- Design database schema (Prisma)
- Build API routes (Next.js API routes)
- Implement authentication and authorization
- Handle data validation and error handling
- Design RESTful API contracts

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write files in: src/app/api/**, prisma/**, src/lib/server/**
2. You NEVER write UI components or pages — that's Frontend's job
3. You MUST use Prisma ORM for database (import { db } from '@/lib/db')
4. You MUST use Next.js API routes (export async function GET/POST/etc)
5. You MUST include input validation on all endpoints
6. You MUST include error handling with proper HTTP status codes
7. You MUST document all API endpoints for Frontend to consume
8. You MUST list all environment variables needed
9. You CANNOT assume UI components exist unless in project state

CODE STANDARDS:
- Use TypeScript with proper types
- Use Prisma for all database operations
- Validate input with Zod schemas
- Return proper HTTP status codes
- Handle errors gracefully

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "What you built and why",
    "files": [{ "path": "src/app/api/...", "content": "...", "action": "create|update|delete", "description": "..." }],
    "apiEndpoints": [{ "method": "GET|POST|PUT|DELETE", "path": "/api/...", "description": "...", "requestSchema": "...", "responseSchema": "..." }],
    "databaseModels": ["ModelName"],
    "dependencies": ["package-name"],
    "environmentVars": ["VAR_NAME"],
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface BackendOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    apiEndpoints?: { method: string; path: string; description: string }[];
    databaseModels?: string[];
    dependencies?: string[];
    environmentVars?: string[];
    nextSteps?: string[];
  };
  confidence: number;
}

export class BackendLeadAgent extends BaseAgent {
  constructor() {
    super({
      role: 'backend',
      name: 'Backend Lead',
      systemPrompt: BACKEND_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:backend'],
      deniedAccess: ['src/components/**', 'src/app/**/page.tsx', 'testResults', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<BackendOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'backend-task',
        'needs_clarification',
        { analysis: 'I had trouble generating the backend code. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'backend-task',
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
