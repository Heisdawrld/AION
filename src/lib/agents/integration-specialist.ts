// AION — Integration Specialist Agent
// Third-party APIs, webhooks, OAuth, and external service integrations.
// "Your app doesn't exist in a vacuum. I connect it to the world."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';

// ============================================================
// THE INTEGRATION SPECIALIST — IF THERE'S AN API, THEY'LL INTEGRATE IT
// ============================================================
const INTEGRATION_SYSTEM_PROMPT = `You are the Integration Specialist Agent of AION. Every external API call has error handling, retries, and timeouts. No blind trust. Respect rate limits, store tokens securely, verify webhook signatures.

ROLE: Integrate third-party APIs (Stripe, SendGrid, Twilio, AWS, etc.), implement OAuth 2.0 flows, build webhook receivers, create API client wrappers with retry logic, design event-driven patterns, implement rate limiting/circuit breakers.

PATTERNS: Adapter (wrap APIs consistently), Circuit Breaker (stop calling failing APIs), Retry with Backoff (1s, 2s, 4s, 8s, max 30s for 5xx), Dead Letter Queue (failed webhooks), Idempotency (safe duplicate handling), Rate Limiter (token bucket).

OAUTH: Redirect to provider → code exchange (PKCE for public clients) → store tokens securely (httpOnly/server session) → proactive refresh → handle revocation.

WEBHOOKS: Verify HMAC-SHA256 signatures, return 200 immediately (process async), log deliveries, idempotency keys, handle out-of-order, store raw payload.

API CLIENT: Timeout 10s reads/30s writes, retry 3x with backoff for 5xx, respect rate limits, distinguish 4xx vs 5xx, log method/status/duration (not sensitive headers).

FILES: Only write to src/lib/integrations/**, src/app/api/auth/**, src/app/api/webhooks/**. Never write UI.

RULES:
1. Environment variables for ALL API keys/secrets
2. Error handling for every API call
3. Verify webhook signatures before processing
4. Implement retry with exponential backoff
5. List all environment variables needed
6. List all new npm dependencies
7. Never hardcode API keys

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create","description":"..."}],"apiIntegrations":[{"service":"...","purpose":"...","envVars":["..."],"dependencies":["..."]}],"environmentVars":["..."],"dependencies":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface IntegrationOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    apiIntegrations?: { service: string; purpose: string; envVars: string[]; dependencies: string[] }[];
    environmentVars?: string[];
    dependencies?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class IntegrationSpecialistAgent extends BaseAgent {
  constructor() {
    super({
      role: 'integration',
      name: 'Integration Specialist',
      systemPrompt: INTEGRATION_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:integration', 'apiIntegrations', 'agentLog'],
      deniedAccess: ['src/components/**', 'src/app/**/page.tsx', 'testResults'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR INTEGRATION TASK:\n${task}`;

    const result = await this.callAgentAI<IntegrationOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'integration-task',
        'needs_clarification',
        { analysis: 'I had trouble building the integration. The requirements may need clarification.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'integration-task',
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
