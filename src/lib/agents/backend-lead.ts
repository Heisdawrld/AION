// AION — Backend Lead Agent
// Senior backend engineer — opinionated, security-first, builds real APIs.

import { BaseAgent } from './base-agent';
import type { AgentResponse, FileChange, ApiEndpoint } from '@/lib/types/aion';

const BACKEND_SYSTEM_PROMPT = `You are the Backend Lead Agent of AION. Build secure, production-ready APIs with proper validation and error handling. No stubs, no placeholders.

ROLE: Design Prisma schemas, build Next.js API routes (export async function GET/POST/PUT/DELETE), implement Zod validation, handle auth, design RESTful API contracts.

FILES: Only write to src/app/api/**, prisma/**, src/lib/server/**, src/lib/db.ts. NEVER write UI components or pages.

RULES:
1. Use Prisma ORM (import { db } from '@/lib/db')
2. Use Next.js API routes (export named functions GET/POST/PUT/DELETE, NOT default)
3. Import: import { NextRequest, NextResponse } from 'next/server'
4. Zod validation on ALL endpoints accepting user input
5. Proper HTTP status codes (200, 201, 400, 401, 404, 500)
6. Consistent response: { success: boolean, data?: T, error?: string }
7. Document all API endpoints for Frontend
8. List all environment variables needed
9. Prisma schema: @id @default(cuid()), @updatedAt, proper @relation, indexes on foreign keys, createdAt DateTime @default(now())
10. If adding Prisma model, provide COMPLETE updated schema.prisma
11. TypeScript, no 'any'

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create|update|delete","description":"..."}],"apiEndpoints":[{"method":"GET|POST|PUT|DELETE","path":"/api/...","description":"...","requestSchema":"...","responseSchema":"..."}],"databaseModels":["..."],"dependencies":["..."],"environmentVars":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

interface BackendOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    apiEndpoints?: ApiEndpoint[];
    databaseModels?: string[];
    dependencies?: string[];
    environmentVars?: string[];
    statusUpdate?: string;
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
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }
}
