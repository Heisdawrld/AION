// AION — Documentation Lead Agent
// Auto-generates docs, API references, tutorials, and guides.
// "Code without documentation is a mystery. I write the manual so you don't have to guess."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';
import { workspaceManager } from '@/lib/engine/workspace-manager';

// ============================================================
// THE DOCUMENTATION LEAD — IF IT'S NOT DOCUMENTED, IT DOESN'T EXIST
// ============================================================
const DOCS_SYSTEM_PROMPT = `You are the Documentation Lead Agent of AION. Write concise, example-driven documentation. Code blocks and bullet points over paragraphs. Quick start first, deep dives later.

ROLE: Generate README.md, API docs with examples for every endpoint, quick start guides, env var docs, CONTRIBUTING.md, changelogs, deployment docs, architecture decision records.

FILES: Only write documentation: README.md, CONTRIBUTING.md, CHANGELOG.md, docs/**, API references. Never modify application code.

RULES:
1. Base docs on ACTUAL source code (read from workspace)
2. Include real file paths and real API routes
3. Document all environment variables found in code
4. Don't document features that don't exist
5. If code missing, note "TODO: Document when implemented"
6. Include working curl examples for all API endpoints

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"README.md","content":"...","action":"create|update","description":"..."}],"apiEndpoints":[{"method":"GET","path":"/api/...","description":"...","documented":true}],"missingDocumentation":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface DocsOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    apiEndpoints?: { method: string; path: string; description: string; documented: boolean }[];
    missingDocumentation?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class DocumentationLeadAgent extends BaseAgent {
  constructor() {
    super({
      role: 'docs',
      name: 'Documentation Lead',
      systemPrompt: DOCS_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:docs', 'apiDocs', 'agentLog'],
      deniedAccess: ['src/app/api/**', 'prisma/**', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // Read source files for accurate documentation
    let sourceFiles = '';
    let existingDocs = '';
    if (projectId) {
      sourceFiles = await this.readProjectFiles(projectId);
      existingDocs = await this.readExistingDocs(projectId);
    }

    const enhancedContext = [
      context,
      sourceFiles ? `\n\nSOURCE CODE FOR DOCUMENTATION:\n${sourceFiles}` : '',
      existingDocs ? `\n\nEXISTING DOCUMENTATION:\n${existingDocs}` : '\n\nNo existing documentation found.',
    ].join('');

    const userMessage = `CURRENT PROJECT STATE + SOURCE CODE:\n${enhancedContext}\n\nYOUR DOCUMENTATION TASK:\n${task}`;

    const result = await this.callAgentAI<DocsOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'docs-task',
        'needs_clarification',
        { analysis: 'I had trouble generating documentation. The source code may not be ready for documentation yet.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'docs-task',
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

  private async readProjectFiles(projectId: string): Promise<string> {
    try {
      const files = await workspaceManager.listFiles(projectId);
      const sourceFiles: string[] = [];
      const relevant = files.filter(f =>
        /\.(ts|tsx|js|jsx|prisma)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('.next')
      );

      // Read API routes and schema for documentation
      const priorityFiles = relevant.filter(f =>
        f.includes('/api/') || f.includes('schema.prisma') || f.includes('route.ts')
      );

      for (const filePath of priorityFiles.slice(0, 15)) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (content) {
          sourceFiles.push(`\n--- FILE: ${filePath} ---\n${content.substring(0, 2000)}`);
        }
      }

      return sourceFiles.join('\n') || 'No source files found.';
    } catch (error: any) {
      return `Error reading files: ${error.message}`;
    }
  }

  private async readExistingDocs(projectId: string): Promise<string> {
    try {
      const docFiles = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/API.md'];
      const existing: string[] = [];

      for (const docFile of docFiles) {
        const content = await workspaceManager.readFile(projectId, docFile);
        if (content) {
          existing.push(`\n--- ${docFile} ---\n${content.substring(0, 2000)}`);
        }
      }

      return existing.join('\n') || '';
    } catch {
      return '';
    }
  }
}
