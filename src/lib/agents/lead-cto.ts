// AION — Lead CTO Agent
// The orchestrator. Bold, opinionated, no yes-man.
// Plans, delegates, reviews, pushes back, and makes final decisions.
// Fully communicative with the user about everything happening.

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  TaskAssignment,
  ExecutionPlan,
  PRD,
  AgentRole,
} from '@/lib/types/aion';

// ============================================================
// THE CTO — BOLD, OPINIONATED, NO BULLSHIT
// ============================================================
const CTO_SYSTEM_PROMPT = `You are the Lead CTO of AION. You are direct, opinionated, and push back when ideas won't work. You explain WHY, offer alternatives, and go the extra mile. Be conversational — talk like a real CTO to a founder, not a chatbot. Be transparent about what agents are doing, blockers, and decisions.

ROLE: Interpret user vision, review PRDs, create execution plans, delegate to agents, monitor progress, keep user informed, ensure product works end-to-end.

TEAM: Business Strategist (PRDs/features — assign FIRST), Frontend Lead (React/Next.js UI), Backend Lead (APIs/database), QA Engineer (tests/validates), DevOps Lead (build/deploy), Research Analyst (web search/competitors), Security Engineer (vulnerabilities/OWASP), Design Architect (UI/UX/accessibility), Data Engineer (schemas/migrations), Documentation Lead (README/API docs), Analytics Engineer (tracking/dashboards), Integration Specialist (3rd-party APIs/OAuth), Performance Engineer (optimization/Core Web Vitals), Compliance Officer (licenses/GDPR/privacy).

RULES:
1. Only reference info in CURRENT PROJECT STATE
2. Never invent unrequested features (suggestions OK, mark clearly)
3. Never approve deployment without QA pass
4. Intervene when agents exceed max retries
5. Prefer simple working over complex broken
6. Never stop until app is live and URL works
7. If stuck, re-plan with different approach

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","decisions":[{"decision":"...","reasoning":"...","basedOn":"..."}],"taskAssignments":[{"taskDescription":"...","assignedTo":"agent_role","priority":"critical|high|medium|low","phase":"discover|plan|build|test|ship","context":"..."}],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// CONVERSATIONAL CTO PROMPT — for follow-up discussions
// ============================================================
const CTO_CONVERSATION_PROMPT = `You are the Lead CTO of AION having a CONVERSATION with the user. Be brutally honest, opinionated, and push back on bad ideas. Talk like a real CTO — conversational, direct, not robotic. Go the extra mile. Share what agents are working on, problems, and decisions.

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","decisions":[{"decision":"...","reasoning":"...","basedOn":"..."}],"taskAssignments":[{"taskDescription":"...","assignedTo":"agent_role","priority":"critical|high|medium|low","phase":"discover|plan|build|test|ship","context":"..."}],"statusUpdate":"YOUR MESSAGE to the user — conversational, honest, bold","nextSteps":["..."],"actionType":"chat|update_plan|add_tasks|modify_feature|push_back|go_extra|approve"},"confidence":0.0-1.0}`;

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
          analysis: 'I had trouble structuring my response. Let me try again.',
          statusUpdate: '⚠️ CTO Agent encountered a formatting issue. Retrying...',
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
      data.confidence || 0.7
    );
  }

  /**
   * CONVERSATIONAL MODE — Talk to the user like a real CTO
   * This is the method used for follow-up conversations after project kickoff.
   * The CTO uses its conversational prompt, has access to conversation history,
   * and can push back, suggest alternatives, or go the extra mile.
   */
  async converse(
    userMessage: string,
    conversationHistory: string,
    projectContext: string
  ): Promise<AgentResponse> {
    const fullMessage = `## CONVERSATION HISTORY (what you and the user have discussed so far):
${conversationHistory || 'This is the beginning of the conversation.'}

## CURRENT PROJECT STATE:
${projectContext}

## USER'S LATEST MESSAGE:
"${userMessage}"

---

Respond to the user. Remember:
- Be HONEST. If their idea won't work, say so and explain why.
- Be BOLD. If there's a better way, tell them. Don't just agree.
- Be TRANSPARENT. Tell them what's happening with their project, what the agents are doing.
- Be CONVERSATIONAL. Talk like a real CTO, not a chatbot.
- If they want to change the plan, evaluate the change honestly. Don't just say yes.
- If they ask about progress, give them a real status update with specifics.
- If they have a bad idea, push back. "I don't think that's the right call because..."
- If they have a great idea, go all in. "That's actually brilliant. Let me adjust the plan."
- If they're confused, explain clearly without being condescending.
- GO THE EXTRA MILE whenever you can.`;

    // Use the conversational prompt for follow-up chats
    const result = await this.callAgentAIWithPrompt<CTOOutput>(
      CTO_CONVERSATION_PROMPT,
      fullMessage
    );

    if (!result.data) {
      // Fallback: try to build a reasonable response from raw text
      const rawText = result.raw || 'I\'m having trouble processing that. Give me a second...';
      return this.createResponse(
        'cto-conversation',
        'needs_clarification',
        {
          analysis: 'Conversational response parsing failed',
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
      data.confidence || 0.7
    );
  }

  /**
   * Specialized method: Kick off a new project by analyzing the user's idea
   * and creating initial task assignments.
   */
  async kickoffProject(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `A user wants to build: "${userIdea}"

Analyze this idea and create an execution plan:
1. FIRST: Tell the user your honest assessment. Is this a good idea? Is it feasible? What are the risks?
2. Break this into phases (discover, plan, build, test, ship)
3. Create task assignments for your team
4. FIRST TASK: Assign the Business Strategist to create a PRD
5. Then plan the build tasks for Frontend and Backend
6. Plan QA testing and DevOps deployment
7. If the user's idea has problems, tell them. Suggest improvements.
8. If you see opportunities to make it better than what they asked for, propose them.

Be specific. Each task should be clear enough for a senior specialist to execute independently.
Your statusUpdate should be conversational — like a CTO talking to the founder about the plan.`;

    return this.execute(task, projectState);
  }

  /**
   * Review a PRD created by the Business Strategist
   */
  async reviewPRD(prd: PRD, projectState: string): Promise<AgentResponse> {
    const task = `The Business Strategist has created a PRD. Review it:

PRD:
${JSON.stringify(prd, null, 2)}

Check:
1. Are all user-requested features covered?
2. Are acceptance criteria clear for each feature?
3. Is the MVP scope well-defined?
4. Are there any contradictions or gaps?
5. Is anything over-engineered or under-specified?

If APPROVED, create detailed task assignments for the build phase.
If REJECTED, explain what needs to be revised — be direct.

Tell the user what you think of the PRD. Be honest.`;

    return this.execute(task, projectState);
  }

  /**
   * Intervene when an agent is stuck
   */
  async intervene(reason: string, projectState: string): Promise<AgentResponse> {
    const task = `INTERVENTION REQUIRED: ${reason}

Review the current project state and decide:
1. Should we retry with a different approach?
2. Should we simplify the task?
3. Should we skip this feature?
4. Should we ask the user for guidance?

Make a decision and create new task assignments if needed.
Tell the user what happened and what you're doing about it.`;

    return this.execute(task, projectState);
  }

  /**
   * Give a status update to the user
   */
  async statusUpdate(projectState: string): Promise<AgentResponse> {
    const task = `Give the user a comprehensive status update on their project.

Include:
- What's been completed so far
- What agents are currently working on
- Any blockers or issues
- What's coming next
- Your honest assessment of how things are going

Be conversational and transparent. No fluff.`;

    return this.execute(task, projectState);
  }
}
