// AION - Lead CTO Agent
// Plans, delegates, reviews, pushes back, and owns the final call.

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  TaskAssignment,
  PRD,
} from '@/lib/types/aion';

const CTO_SYSTEM_PROMPT = `You are the Lead CTO of AION.

IDENTITY:
- You are the front-facing operator the user trusts.
- You sound like a seasoned senior engineer and product operator.
- You are sharp, calm, pragmatic, and commercially aware.
- You do not moralize, posture, or waste motion.

ROLE:
- Interpret the user's vision.
- Review product scope and technical feasibility.
- Create execution plans.
- Delegate work to specialist agents.
- Track risks, blockers, approvals, and delivery readiness.
- Report upward to the user with clear judgment.

TEAM:
- Product Strategist handles PRD and feature framing first.
- UI Systems Lead handles app UI and interaction.
- Platform Lead handles APIs, data flow, and server logic.
- QA Lead validates correctness and readiness.
- Delivery Lead handles build, repo, and deployment operations.
- Research Lead handles external research and evidence gathering.
- Security Lead, Design Director, Data Lead, Docs Lead, Analytics Lead, Integration Lead, Performance Lead, and Compliance Lead support when relevant.

OPERATING RULES:
1. Only rely on the current project state and provided context.
2. Do not invent features the user did not ask for. Suggestions are allowed, but label them clearly.
3. Never approve deployment without QA sign-off.
4. If the plan is weak, say so and replace it with a better one.
5. Prefer simple working systems over complex brittle ones.
6. Keep the user informed without exposing unnecessary internal chatter.
7. If the system is stuck, re-plan decisively.

STATUS UPDATE STYLE:
- Start with the actual call.
- Then what changed.
- Then what happens next.
- Keep it crisp, high-signal, and executive.

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","decisions":[{"decision":"...","reasoning":"...","basedOn":"..."}],"taskAssignments":[{"taskDescription":"...","assignedTo":"agent_role","priority":"critical|high|medium|low","phase":"discover|plan|build|test|ship","context":"..."}],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

const CTO_CONVERSATION_PROMPT = `You are the Lead CTO of AION in active conversation with the user.

BEHAVIOR:
- Speak like an elite senior operator.
- Be direct, useful, and grounded.
- Push back on weak ideas without sounding defensive or preachy.
- If the user is right, say so cleanly and move.
- If the user is wrong, explain the constraint and give the better path.
- Sound premium, not theatrical.

RESPONSE SHAPE:
- Lead with the call or answer.
- Mention the operational state when useful.
- Translate specialist work into one coherent narrative.
- Do not sound like a committee.

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","decisions":[{"decision":"...","reasoning":"...","basedOn":"..."}],"taskAssignments":[{"taskDescription":"...","assignedTo":"agent_role","priority":"critical|high|medium|low","phase":"discover|plan|build|test|ship","context":"..."}],"statusUpdate":"...","nextSteps":["..."],"actionType":"chat|update_plan|add_tasks|modify_feature|push_back|go_extra|approve"},"confidence":0.0-1.0}`;

interface CTOOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    decisions?: { decision: string; reasoning: string; basedOn: string }[];
    taskAssignments?: TaskAssignment[];
    statusUpdate?: string;
    nextSteps?: string[];
    actionType?: string;
  };
  confidence: number;
}

export class LeadCTOAgent extends BaseAgent {
  constructor() {
    super({
      role: 'cto',
      name: 'Lead CTO',
      systemPrompt: CTO_SYSTEM_PROMPT,
      writeAccess: ['taskQueue', 'executionPlan', 'agentLog'],
      deniedAccess: ['fileManifest', 'testResults', 'deployStatus', 'prd'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;
    const result = await this.callAgentAI<CTOOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'cto-task',
        'needs_clarification',
        {
          analysis: 'Structured CTO response failed to parse cleanly.',
          statusUpdate: 'I hit a formatting issue while planning. I am retrying with a narrower response.',
        },
        0.3
      );
    }

    const data = result.data;
    return this.createResponse(
      'cto-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        decisions: data.output?.decisions,
        taskAssignments: data.output?.taskAssignments,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.72
    );
  }

  async converse(
    userMessage: string,
    conversationHistory: string,
    projectContext: string
  ): Promise<AgentResponse> {
    const fullMessage = `## CONVERSATION HISTORY
${conversationHistory || 'This is the beginning of the conversation.'}

## CURRENT PROJECT STATE
${projectContext}

## USER MESSAGE
"${userMessage}"

Respond as the Lead CTO.
- Give the real call.
- Mention relevant execution context.
- If specialists are working, summarize their progress in one voice.
- Ask for approval only when the next move is genuinely risky or ambiguous.
- Avoid filler and generic optimism.`;

    const result = await this.callAgentAIWithPrompt<CTOOutput>(
      CTO_CONVERSATION_PROMPT,
      fullMessage
    );

    if (!result.data) {
      const rawText = result.raw || 'I hit a response formatting issue. Here is the operational truth: I need to retry that cleanly.';
      return this.createResponse(
        'cto-conversation',
        'needs_clarification',
        {
          analysis: 'Conversational CTO parsing failed.',
          statusUpdate: rawText.substring(0, 1000),
        },
        0.4
      );
    }

    const data = result.data;
    return this.createResponse(
      'cto-conversation',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        decisions: data.output?.decisions,
        taskAssignments: data.output?.taskAssignments,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.75
    );
  }

  async kickoffProject(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `A user wants to build: "${userIdea}".

Your job:
1. Give an honest assessment of the idea, feasibility, and main risks.
2. Frame the project into discover, plan, build, test, and ship.
3. Assign the first PRD task to Product Strategist.
4. Queue the core build path for UI Systems Lead and Platform Lead.
5. Make QA and Delivery explicit checkpoints, not afterthoughts.
6. If the idea is bloated, narrow it.
7. If there is a stronger route, say it plainly.

The statusUpdate should sound like a premium CTO briefing a founder.`;

    return this.execute(task, projectState);
  }

  async reviewPRD(prd: PRD, projectState: string): Promise<AgentResponse> {
    const task = `Review this PRD.

PRD:
${JSON.stringify(prd, null, 2)}

Check:
1. Coverage of user-requested outcomes.
2. Clarity of acceptance criteria.
3. Whether the MVP is sharp or bloated.
4. Missing technical decisions or contradictions.
5. Whether the team can execute it without thrash.

If approved, create the build-phase task assignments.
If not approved, reject it directly and say what must change.`;

    return this.execute(task, projectState);
  }

  async intervene(reason: string, projectState: string): Promise<AgentResponse> {
    const task = `Intervention required: ${reason}

Decide whether to:
1. Retry with a different approach.
2. Simplify scope.
3. Skip a broken path.
4. Ask the user for a decision.

Be decisive and reset the team onto the best route.`;

    return this.execute(task, projectState);
  }

  async statusUpdate(projectState: string): Promise<AgentResponse> {
    const task = `Give the user a real status briefing.

Include:
1. What is actually complete.
2. What is running now.
3. What is blocked or risky.
4. What happens next.
5. Your honest read on delivery quality and momentum.`;

    return this.execute(task, projectState);
  }
}
