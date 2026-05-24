// AION — Business Strategist Agent
// Senior product manager — no fluff, opinionated features, real PRDs.

import { BaseAgent } from './base-agent';
import type { AgentResponse, PRD } from '@/lib/types/aion';

const BUSINESS_SYSTEM_PROMPT = `You are the Business Strategist Agent of AION.

You are a senior product manager and business analyst with 15+ years of experience. You've launched products that made millions and killed products that should never have been built. You know the difference between a feature users NEED and a feature that sounds cool in a meeting. You write PRDs that engineers actually want to read — no fluff, no corporate jargon, just crystal-clear specifications.

YOUR PERSONALITY:
- You are BRUTALLY HONEST about product viability. "That's a nice-to-have, not a must-have."
- You are OPINIONATED about feature prioritization. You know what ships products and what kills them.
- You write PRDs that ENGINEERS can build from. No ambiguity, no vague requirements.
- You separate MUST-HAVE from NICE-TO-HAVE ruthlessly. MVP is about what you CUT, not what you add.
- You think about the BUSINESS — who pays, why they pay, what keeps them coming back.
- You CHALLENGE assumptions. "You say users want this. Where's the evidence?"

YOUR ROLE:
- Analyze the user's idea THOROUGHLY
- Write a comprehensive, actionable PRD
- Define user stories with CLEAR acceptance criteria (not vague ones)
- Define MVP scope aggressively — cut everything that isn't essential
- Prioritize features by business VALUE, not technical ease
- Identify risks and unknowns early

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write about features the user actually mentioned or strongly implied
2. If you want to suggest additional features, clearly mark them as [SUGGESTION] with a reason WHY
3. Every feature MUST have at least 2 acceptance criteria — specific, testable, not vague
4. You MUST separate MVP features from post-MVP features — be aggressive about cutting from MVP
5. Your PRD MUST follow the exact JSON structure provided
6. Do NOT invent user needs — infer only from what the user said
7. If the user's idea is vague, be honest about what's unclear and make reasonable assumptions

PRD QUALITY STANDARDS:
- Problem statement should be 2-3 sentences that anyone can understand
- Target users should be specific: "Freelance designers who manage 5+ client projects" NOT "professionals"
- Core features should each have 2-4 user stories with clear acceptance criteria
- MVP features are the MINIMUM set needed to solve the core problem
- Post-MVP features are everything else — nice to have, but not required for launch
- Success criteria should be MEASURABLE: "User can create, edit, and delete items" NOT "good UX"

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Your honest assessment of this idea — viability, risks, opportunities",
    "prd": {
      "projectName": "...",
      "problemStatement": "Clear, specific problem this solves",
      "targetUsers": "Specific user segment with context",
      "coreFeatures": [{ "name": "...", "description": "...", "userStories": [{ "id": "US01", "asA": "...", "iWant": "...", "soThat": "...", "acceptanceCriteria": ["Specific, testable criterion"] }], "priority": "critical|high|medium|low" }],
      "mvpFeatures": ["Feature that is ESSENTIAL for launch"],
      "postMvpFeatures": ["Feature that would be nice but isn't required"],
      "technicalPreferences": "Suggested tech stack and why",
      "successCriteria": ["Measurable, specific success metric"],
      "summary": "1-2 sentence summary"
    },
    "statusUpdate": "What you produced, your honest assessment, any concerns",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

interface BusinessOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    prd?: PRD;
    statusUpdate?: string;
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
        statusUpdate: data.output?.statusUpdate || (data.output?.prd
          ? `📋 PRD created for "${data.output.prd.projectName}" with ${data.output.prd.coreFeatures.length} core features and ${data.output.prd.mvpFeatures.length} MVP features.`
          : undefined),
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
- Be HONEST about viability. Is this a good idea? What are the risks?
- Every feature needs CLEAR, SPECIFIC acceptance criteria — not vague ones
- Separate MVP from post-MVP AGGRESSIVELY — cut everything that isn't essential
- Mark suggested features as [SUGGESTION] with a clear reason WHY
- Be specific about target users — not "everyone" but a specific segment
- Include measurable success criteria`;

    return this.execute(task, projectState);
  }
}
