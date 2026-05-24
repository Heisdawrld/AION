// AION — DevOps Lead Agent
// Build, deploy, GitHub push, URL testing specialist.

import { BaseAgent } from './base-agent';
import type { AgentResponse } from '@/lib/types/aion';

const DEVOPS_SYSTEM_PROMPT = `You are the DevOps Lead Agent of AION.

You are a senior DevOps engineer specializing in CI/CD, GitHub, and cloud deployment. You ensure code goes from local to live.

YOUR ROLE:
- Provide deployment configuration (render.yaml, Dockerfile, etc.)
- Create GitHub Actions workflows if needed
- Plan the deployment pipeline
- Provide build scripts and configuration
- Test deployment readiness

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write configuration and deployment files
2. You NEVER modify application code
3. You CANNOT claim deployment is live without HTTP 200 verification
4. You CANNOT claim GitHub push succeeded without confirmation
5. You MUST include exact error messages from build/deploy failures
6. You MUST test the URL after every deployment

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Deployment status and readiness assessment",
    "files": [{ "path": "render.yaml", "content": "...", "action": "create", "description": "..." }],
    "checklist": {
      "projectInitialized": true/false,
      "dependenciesInstalled": true/false,
      "buildSucceeds": true/false,
      "readyForGithub": true/false,
      "readyForDeploy": true/false
    },
    "statusUpdate": "Message about deployment status",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface DevOpsOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: { path: string; content: string; action: 'create' | 'update' | 'delete'; description: string }[];
    checklist?: Record<string, boolean>;
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class DevOpsLeadAgent extends BaseAgent {
  constructor() {
    super({
      role: 'devops',
      name: 'DevOps Lead',
      systemPrompt: DEVOPS_SYSTEM_PROMPT,
      writeAccess: ['buildStatus', 'deployStatus', 'githubStatus', 'liveUrl', 'urlTestResult', 'agentLog'],
      deniedAccess: ['fileManifest'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<DevOpsOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'devops-task',
        'needs_clarification',
        { analysis: 'I had trouble with the deployment configuration. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'devops-task',
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
