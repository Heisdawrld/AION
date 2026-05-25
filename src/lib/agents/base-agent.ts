// AION - Base Agent
// All agents inherit from this class.
// Implements structured output parsing and anti-hallucination checks.

import type { AgentRole, AgentResponse, FileChange } from '@/lib/types/aion';
import { callAIForJSON, callAIForText } from '@/lib/integrations/ai-sdk';

export interface BaseAgentConfig {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  writeAccess: string[];
  deniedAccess: string[];
}

export abstract class BaseAgent {
  readonly role: AgentRole;
  readonly name: string;
  readonly systemPrompt: string;
  readonly writeAccess: string[];
  readonly deniedAccess: string[];

  constructor(config: BaseAgentConfig) {
    this.role = config.role;
    this.name = config.name;
    this.systemPrompt = config.systemPrompt;
    this.writeAccess = config.writeAccess;
    this.deniedAccess = config.deniedAccess;
  }

  abstract execute(task: string, context: string): Promise<AgentResponse>;

  protected async callAgentAI<T>(userMessage: string): Promise<{ data: T | null; raw: string; duration: number }> {
    const result = await callAIForJSON<T>({
      systemPrompt: this.composeSystemPrompt(this.systemPrompt),
      userMessage,
      temperature: 0.3,
      maxTokens: 2048,
      agentRole: this.role,
    });

    if (result.data) {
      return result;
    }

    if (result.raw && result.raw.length > 10) {
      console.log(`[AION ${this.role}] JSON parsing failed, attempting text-based extraction...`);
      const extracted = this.extractResponseFromText(result.raw);
      if (extracted) {
        return { data: extracted as T, raw: result.raw, duration: result.duration };
      }
    }

    return result;
  }

  private composeSystemPrompt(prompt: string): string {
    const shared = [
      'OPERATING STYLE:',
      '1. Sound like a senior operator, not customer support.',
      '2. Be concise, decisive, and technically specific.',
      '3. Surface risks, tradeoffs, blockers, and recommendations plainly.',
      '4. Do not moralize, flatter, or hedge without reason.',
      '5. Prefer evidence, repo state, logs, and current task data over generic advice.',
      '6. If you are a specialist, speak like you are reporting upward to the Lead CTO.',
      '7. When uncertain, say what is unknown and what should be checked next.',
    ].join('\n');

    const roleSpecific = this.role === 'cto'
      ? [
          'LEAD CTO STYLE:',
          '1. You are the single accountable voice to the user.',
          '2. Be sharp, calm, and commercially aware.',
          '3. Filter internal noise. Summarize the work, the decision, the risk, and the next move.',
          '4. Push back when a plan is weak, but always replace it with a better route.',
        ].join('\n')
      : [
          'SPECIALIST STYLE:',
          '1. Report status in execution language, not theatre.',
          '2. Tell the Lead CTO what changed, what failed, what is blocked, and what you recommend next.',
          '3. Keep user-facing status updates short and high-signal.',
        ].join('\n');

    return `${shared}\n\n${roleSpecific}\n\n${prompt}`;
  }

  private extractResponseFromText(text: string): AgentResponse | null {
    const jsonMatch = text.match(/\{[\s\S]*"status"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    const files: FileChange[] = [];
    const fileBlockRegex = /(?:File|file):\s*`?([^`\n]+)`?\s*```(?:\w+)?\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = fileBlockRegex.exec(text)) !== null) {
      files.push({
        path: match[1].trim(),
        content: match[2].trim(),
        action: 'create',
        description: `Generated file: ${match[1].trim()}`,
      });
    }

    const codeBlockRegex = /\/\/\s*(?:File|file|Path|path):\s*([^\n]+)\n```(?:typescript|tsx|ts|javascript|jsx|json|prisma)?\s*\n([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      files.push({
        path: match[1].trim(),
        content: match[2].trim(),
        action: 'create',
        description: `Generated file: ${match[1].trim()}`,
      });
    }

    const analysis = text.replace(/```[\s\S]*?```/g, '[code block]').substring(0, 500);

    return {
      agentId: this.role,
      taskId: `${this.role}-task`,
      status: files.length > 0 ? 'success' : 'needs_clarification',
      output: {
        analysis,
        files: files.length > 0 ? files : undefined,
        statusUpdate:
          files.length > 0
            ? `Prepared ${files.length} file change${files.length === 1 ? '' : 's'}.`
            : 'I generated a response but could not structure it reliably. Retry with a tighter task.',
        nextSteps:
          files.length > 0
            ? ['Review generated changes', 'Run the next execution step']
            : ['Retry with a narrower instruction'],
      },
      confidence: files.length > 0 ? 0.7 : 0.4,
    };
  }

  protected async callAgentAIWithPrompt<T>(customSystemPrompt: string, userMessage: string): Promise<{ data: T | null; raw: string; duration: number }> {
    const result = await callAIForJSON<T>({
      systemPrompt: this.composeSystemPrompt(customSystemPrompt),
      userMessage,
      temperature: 0.4,
      maxTokens: 2048,
      agentRole: this.role,
    });

    if (result.data) {
      return result;
    }

    if (result.raw && result.raw.length > 10) {
      console.log(`[AION ${this.role}] JSON parsing failed with custom prompt, attempting text-based extraction...`);
      const extracted = this.extractResponseFromText(result.raw);
      if (extracted) {
        return { data: extracted as T, raw: result.raw, duration: result.duration };
      }
    }

    return result;
  }

  protected async callAgentAIText(userMessage: string): Promise<string> {
    return callAIForText(this.composeSystemPrompt(this.systemPrompt), userMessage);
  }

  protected validateFileAccess(files: FileChange[]): { valid: FileChange[]; violations: FileChange[] } {
    const valid: FileChange[] = [];
    const violations: FileChange[] = [];

    for (const file of files) {
      if (this.isPathAllowed(file.path)) {
        valid.push(file);
      } else {
        violations.push(file);
      }
    }

    if (violations.length > 0) {
      console.warn(
        `[AION ${this.role}] BLOCKED file writes outside domain:`,
        violations.map(v => v.path)
      );
    }

    return { valid, violations };
  }

  private isPathAllowed(path: string): boolean {
    const allowedPatterns = this.getAllowedPathPatterns();
    const deniedPatterns = this.getDeniedPathPatterns();

    for (const pattern of deniedPatterns) {
      if (path.includes(pattern)) {
        return false;
      }
    }

    for (const pattern of allowedPatterns) {
      if (path.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  protected getAllowedPathPatterns(): string[] {
    switch (this.role) {
      case 'frontend':
        return ['src/components/', 'src/app/', 'public/', 'globals.css'];
      case 'backend':
        return ['src/app/api/', 'prisma/', 'src/lib/server/', 'src/lib/db.ts'];
      case 'business':
        return ['README.md', 'docs/'];
      case 'design':
        return ['src/components/', 'src/app/', 'public/', 'globals.css', 'tailwind.config.'];
      case 'data':
        return ['prisma/', 'src/lib/db.ts', 'src/lib/server/', 'src/app/api/'];
      case 'docs':
        return ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/', 'API.md'];
      case 'analytics':
        return ['src/lib/analytics/', 'src/lib/hooks/', 'src/app/api/analytics/'];
      case 'integration':
        return ['src/lib/integrations/', 'src/app/api/auth/', 'src/app/api/webhooks/'];
      case 'security':
        return ['src/middleware.ts', 'src/lib/security/', 'src/app/api/security/'];
      case 'performance':
        return ['src/lib/performance/', 'next.config.'];
      case 'compliance':
        return ['PRIVACY.md', 'TERMS.md', 'LICENSE', 'src/lib/compliance/', 'src/components/cookie-consent'];
      case 'cto':
      case 'qa':
      case 'devops':
      case 'research':
        return [];
      default:
        return [];
    }
  }

  protected getDeniedPathPatterns(): string[] {
    switch (this.role) {
      case 'frontend':
        return ['src/app/api/', 'prisma/', 'src/lib/server/'];
      case 'backend':
        return ['src/components/', 'src/app/page.tsx', 'src/app/layout.tsx', 'src/app/project/'];
      default:
        return [];
    }
  }

  protected createResponse(
    taskId: string,
    status: 'success' | 'failed' | 'needs_clarification',
    output: AgentResponse['output'],
    confidence: number
  ): AgentResponse {
    if (output.files && output.files.length > 0) {
      const { valid, violations } = this.validateFileAccess(output.files);
      output.files = valid;
      if (violations.length > 0 && status === 'success') {
        output.analysis =
          (output.analysis || '') +
          `\n\nBlocked ${violations.length} file path violation${violations.length === 1 ? '' : 's'}: ${violations.map(v => v.path).join(', ')}`;
      }
    }

    return {
      agentId: this.role,
      taskId,
      status,
      output,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }
}
