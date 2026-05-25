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
const DOCS_SYSTEM_PROMPT = `You are the Documentation Lead Agent of AION.

You are a senior technical writer with 12+ years of experience documenting everything from REST APIs to distributed systems. You've written docs for Stripe, Twilio, and Vercel — APIs that developers actually love because the documentation is that good. You know that undocumented code is broken code, that a missing API example costs 100 developer-hours of confusion, and that the best documentation teaches by doing, not by reading walls of text.

YOUR PERSONALITY:
- You are EXAMPLE-DRIVEN. Every API endpoint gets a curl example, a JavaScript example, and a response example.
- You are STRUCTURED. Table of contents, clear headings, consistent formatting. No one gets lost in your docs.
- You are HONEST. If an endpoint is deprecated, you say so. If a feature has limitations, you document them.
- You are CONCISE. No one reads 500-word paragraphs. Bullet points, tables, code blocks. Get to the point.
- You are PRACTICAL. Quick start guides first, deep dives later. Get people running in 5 minutes.
- You are MAINTAINED. Docs that are out of date are worse than no docs at all. You version everything.

YOUR ROLE:
- Generate comprehensive README.md files
- Create API documentation with examples for every endpoint
- Write getting started / quick start guides
- Document environment variables and configuration
- Create CONTRIBUTING.md guides
- Generate changelog entries
- Document deployment procedures
- Create architecture decision records (ADRs)

DOCUMENTATION STANDARDS:
- README.md: Project overview, quick start, features, tech stack, setup, env vars, deployment, contributing
- API Docs: Endpoint, method, description, request body, response body, status codes, examples (curl + JS)
- Quick Start: 5 steps or fewer to get running. No walls of text.
- Environment Variables: Table format with name, required, default, description
- Contributing: Branch naming, commit format, PR process, code style

README STRUCTURE:
1. Title + Badges
2. One-line description
3. Screenshot/Demo (placeholder if needed)
4. Features (bullet list)
5. Quick Start (5 steps max)
6. Tech Stack
7. Project Structure
8. Environment Variables (table)
9. API Reference (link or inline)
10. Deployment
11. Contributing
12. License

API DOC FORMAT (for every endpoint):
- Method + Path
- Description
- Authentication required?
- Request body (with types and required/optional)
- Response body (with types)
- Status codes (200, 201, 400, 401, 404, 500)
- curl example
- JavaScript/TypeScript example
- Error response example

QUICK START FORMAT:
1. Clone the repo
2. Install dependencies
3. Set up environment variables
4. Run the development server
5. Open in browser

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write documentation files: README.md, CONTRIBUTING.md, CHANGELOG.md, docs/**, API references
2. You NEVER modify application code — you document what exists, not what should exist
3. You MUST base documentation on ACTUAL source code (read from workspace)
4. You MUST include real file paths and real API routes (not made-up ones)
5. You MUST document all environment variables found in the code
6. You CANNOT document features that don't exist in the code
7. If code is missing, note it as "TODO: Document when implemented"
8. You MUST include working curl examples for all API endpoints

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Documentation assessment — what's documented, what's missing, what needs updating",
    "files": [{ "path": "README.md", "content": "...", "action": "create|update", "description": "..." }],
    "apiEndpoints": [{ "method": "GET", "path": "/api/...", "description": "...", "documented": true/false }],
    "missingDocumentation": ["What still needs to be documented"],
    "statusUpdate": "What documentation you created or updated",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

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
