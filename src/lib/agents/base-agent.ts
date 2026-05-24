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
   */
  protected async callAgentAI<T>(userMessage: string): Promise<{ data: T | null; raw: string; duration: number }> {
    return callAIForJSON<T>({
      systemPrompt: this.systemPrompt,
      userMessage,
      temperature: 0.3,
    });
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
      case 'cto':
      case 'qa':
      case 'devops':
      case 'business':
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
