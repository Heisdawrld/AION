// AION — Lead CTO Agent
// The orchestrator. Plans, delegates, reviews, and makes final decisions.

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  TaskAssignment,
  ExecutionPlan,
  PRD,
  AgentRole,
} from '@/lib/types/aion';

const CTO_SYSTEM_PROMPT = `You are the Lead CTO Agent of AION — the Autonomous Intelligent Orchestration Network.

You are a senior CTO with 20+ years of experience leading engineering teams. You are the BOSS of this autonomous software development team.

YOUR ROLE:
- Interpret the user's vision and decide how to build it
- Review PRDs created by the Business Strategist
- Create execution plans with specific tasks
- Delegate tasks to specialist agents
- Monitor progress and intervene when agents are stuck
- Ensure the final product works end-to-end

YOUR TEAM:
- Business Strategist (💼): Creates PRDs and defines features — assign FIRST
- Frontend Lead (🎨): Builds React/Next.js UI — builds components and pages
- Backend Lead (⚙️): Builds APIs and database — designs schema and API routes
- QA Engineer (🧪): Tests and validates — runs build, catches bugs
- DevOps Lead (🚀): Builds, deploys, tests URLs — ships to GitHub and Render

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY reference information provided in the CURRENT PROJECT STATE
2. You NEVER invent features not requested by the user
3. You NEVER approve deployment without QA pass
4. You ALWAYS intervene when an agent exceeds max retries
5. You prefer SIMPLE working solutions over COMPLEX broken ones
6. You NEVER stop until the app is live and the URL works
7. If stuck, you RE-PLAN with a different approach

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Your analysis of the current state",
    "decisions": [{ "decision": "...", "reasoning": "...", "basedOn": "..." }],
    "taskAssignments": [{ "taskDescription": "...", "assignedTo": "agent_role", "priority": "critical|high|medium|low", "phase": "discover|plan|build|test|ship", "context": "What the agent needs to know" }],
    "statusUpdate": "Message to the user about progress",
    "nextSteps": ["What should happen next"]
  },
  "confidence": 0.0-1.0
}`;

interface CTOOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    decisions?: { decision: string; reasoning: string; basedOn: string }[];
    taskAssignments?: TaskAssignment[];
    statusUpdate?: string;
    nextSteps?: string[];
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
      // Fallback: try to extract useful info from raw response
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
   * Specialized method: Kick off a new project by analyzing the user's idea
   * and creating initial task assignments.
   */
  async kickoffProject(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `A user wants to build: "${userIdea}"

Analyze this idea and create an execution plan:
1. Break this into phases (discover, plan, build, test, ship)
2. Create task assignments for your team
3. FIRST: Assign the Business Strategist to create a PRD
4. Then plan the build tasks for Frontend and Backend
5. Plan QA testing and DevOps deployment

Be specific. Each task should be clear enough for a senior specialist to execute independently.`;

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

If APPROVED, create detailed task assignments for the build phase.
If REJECTED, explain what needs to be revised.`;

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

Make a decision and create new task assignments if needed.`;

    return this.execute(task, projectState);
  }
}
