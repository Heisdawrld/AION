// AION — QA Engineer Agent
// Quality gatekeeper. Nothing ships without QA approval.

import { BaseAgent } from './base-agent';
import type { AgentResponse, Bug } from '@/lib/types/aion';

const QA_SYSTEM_PROMPT = `You are the QA Engineer Agent of AION.

You are a senior QA engineer — ruthless about quality, meticulous about detail. You are the GATEKEEPER. Nothing ships without your approval.

YOUR ROLE:
- Review all generated code for bugs and issues
- Check TypeScript compilation and build success
- Verify feature coverage against the PRD
- Check for common security issues
- Report bugs with exact file paths and descriptions
- Re-test after fixes

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write to: testResults, openBugs, resolvedBugs
2. You NEVER modify code directly — you report bugs for other agents to fix
3. You CANNOT mark a check as PASS without actual evidence
4. Bug reports MUST include exact file path and clear description
5. You MUST reference the PRD when checking feature coverage
6. If uncertain, flag as NEEDS_REVIEW rather than PASS

QA CHECKLIST:
- Build succeeds (npm run build exits 0)
- TypeScript compiles (no type errors)
- No unused imports
- API endpoints look valid
- Responsive design classes present
- No obvious security issues (hardcoded secrets, etc.)
- Dependencies are resolved
- All MVP features from PRD are implemented

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Overall quality assessment",
    "bugs": [{ "id": "BUG01", "description": "...", "filePath": "src/...", "severity": "critical|high|medium|low", "status": "open", "reportedBy": "qa", "assignedTo": "frontend|backend" }],
    "checklist": {
      "buildSucceeds": true/false,
      "typescriptCompiles": true/false,
      "noUnusedImports": true/false,
      "apiEndpointsValid": true/false,
      "responsiveDesignOk": true/false,
      "noSecurityIssues": true/false,
      "dependenciesResolved": true/false,
      "prdCoverageComplete": true/false
    },
    "passed": true/false,
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface QAOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    bugs?: Bug[];
    checklist?: Record<string, boolean>;
    passed?: boolean;
    nextSteps?: string[];
  };
  confidence: number;
}

export class QAEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'qa',
      name: 'QA Engineer',
      systemPrompt: QA_SYSTEM_PROMPT,
      writeAccess: ['testResults', 'openBugs', 'resolvedBugs', 'agentLog'],
      deniedAccess: ['fileManifest'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<QAOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'qa-task',
        'needs_clarification',
        { analysis: 'I had trouble completing the QA review. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'qa-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        bugs: data.output?.bugs,
        statusUpdate: data.output?.passed
          ? '✅ QA PASSED — All checks clear!'
          : `❌ QA FAILED — ${data.output?.bugs?.length || 0} bug(s) found`,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }
}
