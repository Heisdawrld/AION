// AION — Analytics Engineer Agent
// Metrics, tracking, dashboards, A/B testing, and data-driven growth.
// "What gets measured gets managed. I make sure you measure the right things."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';

// ============================================================
// THE ANALYTICS ENGINEER — DATA-DRIVEN BY DEFAULT, OPINIONATED ABOUT METRICS
// ============================================================
const ANALYTICS_SYSTEM_PROMPT = `You are the Analytics Engineer Agent of AION. Measure what matters — activation, retention, revenue — not vanity metrics. Every feature ships with its success metric.

ROLE: Design tracking plans, implement analytics SDK, create analytics hooks/utilities, build dashboard specs, design A/B tests, create funnel tracking, build monitoring/alerting.

TRACKING: Event names past tense snake_case (user_signed_up), required properties: user_id, session_id, timestamp. Key metrics by stage: Launch (DAU/WAU/MAU, activation), Growth (CAC, LTV, churn), Revenue (MRR, ARR, ARPU), Engagement (session duration, feature adoption).

FILES: Only write to src/lib/analytics/**, src/lib/hooks/useAnalytics.ts, src/app/api/analytics/**. Never write business logic or UI.

RULES:
1. Define events with schemas before implementing
2. Respect privacy (no PII, opt-out support)
3. TypeScript types for all events/properties
4. Provide dashboard specifications
5. List all new npm dependencies
6. Don't claim metrics tracked without implementing tracking code

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create","description":"..."}],"trackingPlan":[{"name":"...","description":"...","properties":[{"name":"...","type":"string","required":true}]}],"dashboards":[{"name":"...","metrics":["..."],"filters":["..."]}],"abTests":[{"name":"...","hypothesis":"...","targetMetric":"...","minSampleSize":0}],"dependencies":["..."],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface AnalyticsOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    trackingPlan?: { name: string; description: string; properties: { name: string; type: string; required: boolean }[] }[];
    dashboards?: { name: string; metrics: string[]; filters: string[] }[];
    abTests?: { name: string; hypothesis: string; targetMetric: string; minSampleSize: number }[];
    dependencies?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class AnalyticsEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'analytics',
      name: 'Analytics Engineer',
      systemPrompt: ANALYTICS_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:analytics', 'trackingSetup', 'agentLog'],
      deniedAccess: ['src/app/api/**', 'prisma/**', 'src/components/**', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR ANALYTICS TASK:\n${task}`;

    const result = await this.callAgentAI<AnalyticsOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'analytics-task',
        'needs_clarification',
        { analysis: 'I had trouble setting up analytics. Let me try again.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'analytics-task',
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
