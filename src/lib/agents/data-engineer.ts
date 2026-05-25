// AION — Data Engineer Agent
// Database optimization, schema migrations, data pipelines, and query performance.
// "A slow query isn't a database problem — it's a design problem. I fix both."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';
import { workspaceManager } from '@/lib/engine/workspace-manager';

// ============================================================
// THE DATA ENGINEER — SCHEMAS THAT SCALE, QUERIES THAT FLY
// ============================================================
const DATA_SYSTEM_PROMPT = `You are the Data Engineer Agent of AION. Design schemas that don't need rewriting, queries that return in milliseconds, migrations that don't lose data.

ROLE: Design/optimize Prisma schemas, create/review migrations, fix N+1 queries, design indexing strategies, build seeding scripts, optimize queries, design Zod validation schemas, create DB utilities.

FILES: Only write to prisma/**, src/lib/db.ts, src/lib/server/**, src/app/api/** (data-related only). Never write UI components/pages.

PRISMA STANDARDS: @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt, enums for status fields, proper @relation with onDelete/onUpdate, index all foreign keys, composite indexes for multi-field queries, @@unique for business uniqueness, Decimal for money (not Float).

QUERY RULES: Select only needed fields, use include for relations, batch with createMany/updateMany, transactions for multi-step, cursor-based pagination, DB-level aggregations.

RULES:
1. Provide complete Prisma schema files (not partial edits)
2. Include indexes for all foreign keys
3. Document every model/field with comments
4. List all new npm dependencies
5. Include rollback plans for migrations
6. Verify existing schema before modifying

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"prisma/schema.prisma","content":"...","action":"create|update","description":"..."}],"schemaAnalysis":{"models":["..."],"relationships":["..."],"indexes":["..."],"missingIndexes":["..."],"nPlusOneRisks":["..."]},"migrationPlan":"...","dependencies":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface DataOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    schemaAnalysis?: {
      models?: string[];
      relationships?: string[];
      indexes?: string[];
      missingIndexes?: string[];
      nPlusOneRisks?: string[];
    };
    migrationPlan?: string;
    dependencies?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class DataEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'data',
      name: 'Data Engineer',
      systemPrompt: DATA_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:data', 'schemaMigrations', 'agentLog'],
      deniedAccess: ['src/components/**', 'src/app/**/page.tsx', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // Read existing schema if available
    let existingSchema = '';
    if (projectId) {
      existingSchema = await this.readExistingSchema(projectId);
    }

    const enhancedContext = existingSchema
      ? `${context}\n\n========================================\nEXISTING PRISMA SCHEMA:\n========================================\n${existingSchema}`
      : context;

    const userMessage = `CURRENT PROJECT STATE:\n${enhancedContext}\n\nYOUR DATA ENGINEERING TASK:\n${task}`;

    const result = await this.callAgentAI<DataOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'data-task',
        'needs_clarification',
        { analysis: 'I had trouble generating the database schema. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'data-task',
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

  private async readExistingSchema(projectId: string): Promise<string> {
    try {
      const content = await workspaceManager.readFile(projectId, 'prisma/schema.prisma');
      return content || '';
    } catch {
      return '';
    }
  }
}
