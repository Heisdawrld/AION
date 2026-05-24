// AION — Base Agent
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

  /**
   * Execute a task. Must be implemented by each agent.
   */
  abstract execute(task: string, context: string): Promise<AgentResponse>;

  /**
   * Call AI with the agent's system prompt + task context.
   * Returns parsed JSON response.
   * If JSON parsing fails, attempts to extract structured data from text.
   */
  protected async callAgentAI<T>(userMessage: string): Promise<{ data: T | null; raw: string; duration: number }> {
    const result = await callAIForJSON<T>({
      systemPrompt: this.systemPrompt,
      userMessage,
      temperature: 0.3,
      maxTokens: 8192, // More tokens for code generation
    });

    // If JSON parsing succeeded, return it
    if (result.data) {
      return result;
    }

    // If JSON parsing failed but we have raw content, try to build a response from it
    if (result.raw && result.raw.length > 10) {
      console.log(`[AION ${this.role}] JSON parsing failed, attempting text-based extraction...`);
      const extracted = this.extractResponseFromText(result.raw);
      if (extracted) {
        return { data: extracted as T, raw: result.raw, duration: result.duration };
      }
    }

    return result;
  }

  /**
   * Attempt to extract a structured response from free-form text.
   * This is a fallback when the AI doesn't return valid JSON.
   */
  private extractResponseFromText(text: string): AgentResponse | null {
    // Try to find a JSON-like structure in the text
    const jsonMatch = text.match(/\{[\s\S]*"status"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    // If no JSON found, build a response from the text
    // Check if the text contains file blocks
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

    // Also try ```typescript or ```tsx blocks with filenames in comments
    const codeBlockRegex = /\/\/\s*(?:File|file|Path|path):\s*([^\n]+)\n```(?:typescript|tsx|ts|javascript|jsx|json|prisma)?\s*\n([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      files.push({
        path: match[1].trim(),
        content: match[2].trim(),
        action: 'create',
        description: `Generated file: ${match[1].trim()}`,
      });
    }

    // Build a reasonable response
    const analysis = text.replace(/```[\s\S]*?```/g, '[code block]').substring(0, 500);

    return {
      agentId: this.role,
      taskId: `${this.role}-task`,
      status: files.length > 0 ? 'success' : 'needs_clarification',
      output: {
        analysis,
        files: files.length > 0 ? files : undefined,
        statusUpdate: files.length > 0
          ? `Generated ${files.length} file(s)`
          : 'I generated a response but could not structure it properly. Retrying might help.',
        nextSteps: files.length > 0
          ? ['Run next agent task', 'Install new dependencies if any']
          : ['Retry with simpler task'],
      },
      confidence: files.length > 0 ? 0.7 : 0.4,
    };
  }

  /**
   * Call AI with a CUSTOM system prompt (instead of the agent's default).
   * Used for specialized modes like CTO's conversational mode.
   */
  protected async callAgentAIWithPrompt<T>(customSystemPrompt: string, userMessage: string): Promise<{ data: T | null; raw: string; duration: number }> {
    const result = await callAIForJSON<T>({
      systemPrompt: customSystemPrompt,
      userMessage,
      temperature: 0.4, // Slightly higher for conversational personality
      maxTokens: 8192,
    });

    if (result.data) {
      return result;
    }

    // If JSON parsing failed but we have raw content, try to extract
    if (result.raw && result.raw.length > 10) {
      console.log(`[AION ${this.role}] JSON parsing failed with custom prompt, attempting text-based extraction...`);
      const extracted = this.extractResponseFromText(result.raw);
      if (extracted) {
        return { data: extracted as T, raw: result.raw, duration: result.duration };
      }
    }

    return result;
  }

  /**
   * Call AI for a text response (no JSON parsing).
   */
  protected async callAgentAIText(userMessage: string): Promise<string> {
    return callAIForText(this.systemPrompt, userMessage);
  }

  /**
   * Validate that a file change is within this agent's write boundaries.
   * This is a CRITICAL anti-hallucination check.
   */
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

  /**
   * Check if a file path is within this agent's allowed write domain.
   */
  private isPathAllowed(path: string): boolean {
    const allowedPatterns = this.getAllowedPathPatterns();
    const deniedPatterns = this.getDeniedPathPatterns();

    // Check denied first (takes priority)
    for (const pattern of deniedPatterns) {
      if (path.includes(pattern)) {
        return false;
      }
    }

    // Check allowed
    for (const pattern of allowedPatterns) {
      if (path.includes(pattern)) {
        return true;
      }
    }

    // Default deny if no pattern matches
    return false;
  }

  protected getAllowedPathPatterns(): string[] {
    switch (this.role) {
      case 'frontend':
        return ['src/components/', 'src/app/', 'public/', 'globals.css'];
      case 'backend':
        return ['src/app/api/', 'prisma/', 'src/lib/server/', 'src/lib/db.ts'];
      case 'business':
        return ['README.md', 'docs/']; // Business agent writes README and docs
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
        return []; // Non-code agents don't write files directly
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

  /**
   * Create a standard agent response with anti-hallucination checks.
   */
  protected createResponse(
    taskId: string,
    status: 'success' | 'failed' | 'needs_clarification',
    output: AgentResponse['output'],
    confidence: number
  ): AgentResponse {
    // Validate file access before including in response
    if (output.files && output.files.length > 0) {
      const { valid, violations } = this.validateFileAccess(output.files);
      output.files = valid;
      if (violations.length > 0 && status === 'success') {
        output.analysis = (output.analysis || '') +
          `\n\n⚠️ ${violations.length} file(s) blocked due to domain boundary violation: ${violations.map(v => v.path).join(', ')}`;
      }
    }

    return {
      agentId: this.role,
      taskId,
      status,
      output,
      confidence: Math.max(0, Math.min(1, confidence)), // Clamp 0-1
    };
  }
}
