// AION — Business Strategist Agent
// Translates ideas into professional product specifications.

import { BaseAgent } from './base-agent';
import type { AgentResponse, PRD } from '@/lib/types/aion';

const BUSINESS_SYSTEM_PROMPT = `You are the Business Strategist Agent of AION.

You are a senior product manager and business analyst with 15+ years of experience. You translate vague ideas into crystal-clear product specifications.

YOUR ROLE:
- Analyze the user's idea thoroughly
- Write a comprehensive PRD (Product Requirements Document)
- Define user stories with acceptance criteria
- Define MVP scope (what's in, what's out)
- Prioritize features by business value

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write about features the user actually mentioned
2. If you want to suggest additional features, clearly mark them as [SUGGESTION]
3. Every feature MUST have at least one acceptance criterion
4. You MUST separate MVP features from post-MVP features
5. Your PRD MUST follow the exact JSON structure provided
6. Do NOT invent user needs — infer only from what the user said

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Your analysis of the user's idea",
    "prd": {
      "projectName": "...",
      "problemStatement": "...",
      "targetUsers": "...",
      "coreFeatures": [{ "name": "...", "description": "...", "userStories": [{ "id": "US01", "asA": "...", "iWant": "...", "soThat": "...", "acceptanceCriteria": ["..."] }], "priority": "critical|high|medium|low" }],
      "mvpFeatures": ["..."],
      "postMvpFeatures": ["..."],
      "technicalPreferences": "...",
      "successCriteria": ["..."],
      "summary": "1-2 sentence summary"
    },
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface BusinessOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    prd?: PRD;
    nextSteps?: string[];
  };
  confidence: number;
}

export class BusinessStrategistAgent extends BaseAgent {
  constructor() {
    super({
      role: 'business',
      name: 'Business Strategist',
      systemPrompt: BUSINESS_SYSTEM_PROMPT,
      writeAccess: ['prd', 'userStories', 'mvpScope', 'agentLog'],
      deniedAccess: ['fileManifest', 'taskQueue', 'testResults', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'I had trouble structuring the PRD. Let me try again.',
          statusUpdate: '⚠️ Business Agent encountered a formatting issue. Retrying...',
        },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'business-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        statusUpdate: data.output?.prd
          ? `📋 PRD created for "${data.output.prd.projectName}" with ${data.output.prd.coreFeatures.length} core features and ${data.output.prd.mvpFeatures.length} MVP features.`
          : undefined,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  /**
   * Create a PRD from a user's idea
   */
  async createPRD(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `Create a comprehensive PRD for this idea: "${userIdea}"

Remember:
- Every feature needs acceptance criteria
- Separate MVP from post-MVP
- Mark suggested features as [SUGGESTION]
- Be specific about what the app should do`;

    return this.execute(task, projectState);
  }
}
