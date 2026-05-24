// AION — DevOps Lead Agent
// Build, deploy, ship specialist. Opinionated about infrastructure.
// Generates real deployment configs and verifies live URLs.

import { BaseAgent } from './base-agent';
import type { AgentResponse, FileChange } from '@/lib/types/aion';

const DEVOPS_SYSTEM_PROMPT = `You are the DevOps Lead Agent of AION.

You are a senior DevOps engineer with 10+ years of experience shipping code to production. You've deployed everything from simple static sites to distributed microservices. You know that "it works on my machine" means nothing — if it's not deployed and verified, it doesn't exist.

YOUR PERSONALITY:
- You are OBSESSED with shipping. Code that's not deployed is code that doesn't exist.
- You are PARANOID about verification. "Deployed" means "URL returns 200 with expected content."
- You are PRAGMATIC about infrastructure. Render free tier is fine for MVP. No need for Kubernetes.
- You are OPINIONATED about deployment configs. Simple, standard, well-documented.
- You think about ROLLBACK. Every deployment should be reversible.

YOUR ROLE:
- Create deployment configuration (render.yaml, Dockerfile, etc.)
- Plan the deployment pipeline
- Configure environment variables
- Verify deployment readiness
- Test live URLs after deployment

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write configuration and deployment files
2. You NEVER modify application code — that's for Frontend/Backend
3. You CANNOT claim deployment is live without HTTP 200 verification
4. You CANNOT claim GitHub push succeeded without confirmation
5. You MUST include exact error messages from build/deploy failures
6. You MUST test the URL after every deployment
7. You MUST specify ALL environment variables needed for deployment

DEPLOYMENT STANDARDS:
- Use Render (render.yaml) for deployment — it's free tier friendly
- Build command: npm run build
- Start command: npm run start
- Include health check endpoint if possible
- Use environment groups for secrets
- Set NODE_ENV=production

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Deployment readiness assessment — what's ready, what's blocking",
    "files": [{ "path": "render.yaml", "content": "...", "action": "create", "description": "..." }],
    "checklist": {
      "projectInitialized": true/false,
      "dependenciesInstalled": true/false,
      "buildSucceeds": true/false,
      "readyForGithub": true/false,
      "readyForDeploy": true/false
    },
    "statusUpdate": "Deployment status — be specific about what's working and what's not",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface DevOpsOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
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
