# MASTER PLAN — Autonomous Multi-Agent Development Platform
> Version: 1.0 | Created: 2026-05-24 | Status: PLANNING
> This is the SINGLE SOURCE OF TRUTH for the entire project.
> Every agent, every rule, every decision is documented here.
> DEVIATION FROM THIS DOCUMENT = HALLUCINATION.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Anti-Hallucination Architecture](#2-anti-hallucination-architecture)
3. [The Memory System](#3-the-memory-system)
4. [Agent Definitions & Boundaries](#4-agent-definitions--boundaries)
5. [Agent Communication Protocol](#5-agent-communication-protocol)
6. [The Orchestration Engine](#6-the-orchestration-engine)
7. [The Autonomous Loop](#7-the-autonomous-loop)
8. [Error Handling & Recovery](#8-error-handling--recovery)
9. [Tech Stack & Infrastructure](#9-tech-stack--infrastructure)
10. [Database Schema](#10-database-schema)
11. [File Structure](#11-file-structure)
12. [Implementation Phases](#12-implementation-phases)
13. [Risk Mitigation](#13-risk-mitigation)
14. [Success Criteria](#14-success-criteria)
15. [Appendix: Agent System Prompts](#15-appendix-agent-system-prompts)

---

## 1. PROJECT OVERVIEW

### 1.1 What We're Building
An autonomous multi-agent platform where 6 AI agents (1 Lead + 5 Specialists) work together to build, test, and ship complete web applications — from a single user prompt to a live, deployed URL.

### 1.2 Core Philosophy
- **Grounded, not creative** — Agents reference facts, not imagination
- **Validated, not assumed** — Everything is tested before it's "done"
- **Structured, not free-form** — Outputs are parsed, not interpreted
- **Supervised, not independent** — The Lead Agent oversees everything
- **Persistent, not ephemeral** — State survives across agent turns

### 1.3 Hard Constraints
- Budget: $0
- Hosting: Render free tier
- Compute: Small personal computer
- AI: z-ai-web-dev-sdk (free, no API keys)
- Framework: Next.js 16

---

## 2. ANTI-HALLUCINATION ARCHITECTURE

### 2.1 Why Agents Hallucinate
Hallucination happens when:
1. An agent invents facts not in the project state
2. An agent assumes code works without verifying
3. An agent crosses into another agent's domain
4. An agent loses context between turns
5. An agent generates free-form text that can't be validated

### 2.2 The 7 Anti-Hallucination Layers

#### LAYER 1: Structured Outputs (The Foundation)
Every agent MUST return structured JSON, not free-form text.

```typescript
// Every agent response follows this exact schema
interface AgentResponse {
  agentId: AgentRole;           // Who is responding
  taskId: string;               // Which task they're working on
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    files?: FileChange[];       // Code changes — structured, not prose
    analysis?: string;          // Analysis text — always grounded in project state
    decisions?: Decision[];     // Decisions made — with reasoning
    bugs?: Bug[];               // Bugs found — with exact locations
    testResults?: TestResult[]; // Test outcomes — pass/fail with details
  };
  confidence: number;           // 0-1, how confident the agent is
  dependencies?: string[];      // What this output depends on
  nextSteps?: string[];         // What should happen next
}
```

**Why this prevents hallucination**: Free-form text is where hallucination lives. Structured JSON forces agents to be specific. A field like `files: [{ path: "src/app/page.tsx", content: "..." }]` can't hallucinate — it either creates a real file or it doesn't.

#### LAYER 2: Project Board as Ground Truth
Every agent reads from and writes to a single shared Project Board. No agent has "private knowledge."

```typescript
interface ProjectBoard {
  // IDENTITY
  projectId: string;
  projectName: string;
  createdAt: Date;

  // BUSINESS CONTEXT (written by Business Agent)
  prd: PRD | null;                    // Product Requirements Document
  userStories: UserStory[];           // Feature-level requirements
  mvpScope: string[];                 // What's in MVP

  // PLANNING (written by Lead Agent)
  executionPlan: ExecutionPlan;       // High-level plan with phases
  taskQueue: Task[];                  // Ordered task list
  completedTasks: CompletedTask[];    // Done tasks with outputs
  failedTasks: FailedTask[];          // Failed tasks with reasons

  // CODE STATE (written by Frontend/Backend Agents)
  fileManifest: FileEntry[];          // Every file in the project
  dependencies: string[];             // package.json dependencies

  // QUALITY STATE (written by QA Agent)
  testResults: TestResult[];          // All test outcomes
  openBugs: Bug[];                    // Unresolved bugs
  resolvedBugs: Bug[];                // Fixed bugs

  // DEPLOYMENT STATE (written by DevOps Agent)
  buildStatus: 'never' | 'building' | 'success' | 'failed';
  githubStatus: 'never' | 'pushed' | 'failed';
  deployStatus: 'never' | 'deploying' | 'deployed' | 'failed';
  liveUrl: string | null;
  urlTestResult: UrlTestResult | null;

  // AGENT LOG (written by all agents)
  agentLog: AgentLogEntry[];          // Full history of all agent actions

  // METADATA
  totalAgentCycles: number;           // How many agent turns have happened
  lastActivityAt: Date;
  status: 'planning' | 'building' | 'testing' | 'deploying' | 'live' | 'failed';
}
```

**Why this prevents hallucination**: No agent can claim "I already built the login page" unless the Project Board has a CompletedTask with that output. The Board is the truth.

#### LAYER 3: Agent Boundaries (Strict Domain Isolation)
Each agent has a **defined interface** — inputs they accept and outputs they produce. They CANNOT produce outputs outside their domain.

| Agent | CAN Write To | CANNOT Write To |
|-------|-------------|-----------------|
| Lead CTO | taskQueue, executionPlan, agentLog | fileManifest, testResults, deployStatus |
| Frontend Lead | fileManifest (frontend files only) | API routes, database schema |
| Backend Lead | fileManifest (backend files only) | UI components, page styling |
| QA Engineer | testResults, openBugs, resolvedBugs | fileManifest (QA never writes code) |
| DevOps Lead | buildStatus, deployStatus, githubStatus, liveUrl | fileManifest (DevOps never writes app code) |
| Business Strategist | prd, userStories, mvpScope | fileManifest (Business never writes code) |

**Why this prevents hallucination**: A frontend agent can't hallucinate a backend API because it literally cannot write to backend files. The boundary is enforced in code, not just prompt.

#### LAYER 4: Validation Gates (Nothing Moves Forward Without Proof)
Every major step has a validation gate:

```
Business Agent writes PRD
        │
        ▼
   ┌─────────────┐
   │ GATE 1: PRD │  Lead Agent reviews PRD for completeness
   │  REVIEW     │  Must have: problem statement, users, features, MVP scope
   └──────┬──────┘
          │ PASS
          ▼
Lead Agent creates Execution Plan
          │
          ▼
   ┌─────────────┐
   │ GATE 2:     │  Lead Agent verifies plan covers all PRD features
   │  PLAN CHECK │  Every user story has at least one task
   └──────┬──────┘
          │ PASS
          ▼
Frontend/Backend build code
          │
          ▼
   ┌─────────────┐
   │ GATE 3:     │  QA Agent runs tests + build
   │  QA REVIEW  │  0 critical bugs + build succeeds = PASS
   └──────┬──────┘
          │ PASS
          ▼
DevOps deploys
          │
          ▼
   ┌─────────────┐
   │ GATE 4:     │  DevOps pings live URL
   │  LIVE TEST  │  HTTP 200 + expected content = PASS
   └──────┬──────┘
          │ PASS
          ▼
   ✅ PROJECT COMPLETE
```

**Why this prevents hallucination**: "It works" isn't a feeling — it's a test result. "It's deployed" isn't an assumption — it's a verified HTTP 200.

#### LAYER 5: Referenced Context (Agents CANNOT Invent)
Every agent prompt includes EXACT context from the Project Board. No agent relies on "memory" — they read the Board every time.

```typescript
function buildAgentPrompt(agent: AgentRole, task: Task, board: ProjectBoard) {
  return `
You are the ${agent} Agent. You are working on task: "${task.description}".

CURRENT PROJECT STATE (READ FROM BOARD — DO NOT INVENT):
- Project: ${board.projectName}
- PRD Summary: ${board.prd?.summary || 'Not yet created'}
- Completed tasks: ${board.completedTasks.map(t => t.id + ': ' + t.description).join(', ')}
- Open bugs: ${board.openBugs.map(b => b.id + ': ' + b.description).join(', ')}
- Files already created: ${board.fileManifest.map(f => f.path).join(', ')}
- Dependencies: ${board.dependencies.join(', ')}

YOUR BOUNDARIES:
- You CAN write to: ${AGENT_WRITE_ACCESS[agent].join(', ')}
- You CANNOT write to: ${AGENT_DENIED_ACCESS[agent].join(', ')}

YOUR TASK:
${task.description}

RULES:
1. ONLY reference information from the CURRENT PROJECT STATE above
2. Do NOT assume any file exists unless it's in the file manifest
3. Do NOT assume any feature is built unless it's in completed tasks
4. Return your output in the structured AgentResponse format
5. If you're unsure, set confidence < 0.7 and explain what's unclear
  `;
}
```

**Why this prevents hallucination**: The agent literally cannot claim something exists unless the Board says so. It's reading from a database, not making things up.

#### LAYER 6: Retry Budgets (Prevents Infinite Loops)
Every task has a maximum number of retries. If an agent fails repeatedly, the Lead Agent intervenes with a different approach.

```typescript
interface Task {
  id: string;
  description: string;
  assignedTo: AgentRole;
  status: 'pending' | 'in_progress' | 'review' | 'done' | 'failed';
  retryCount: number;       // How many times this task has been attempted
  maxRetries: 3;            // HARD LIMIT — no more than 3 attempts
  feedback?: string;        // What went wrong (from QA or Lead)
  approach?: string;        // Which approach was tried (to avoid repeating)
}

// In the orchestrator:
if (task.retryCount >= task.maxRetries) {
  // DON'T retry again — escalate to Lead Agent
  leadAgent.intervene(task, 'max_retries_exceeded');
}
```

**Why this prevents hallucination**: Agents going in circles is a form of hallucination — they keep trying the same broken approach. Retry budgets force a reset.

#### LAYER 7: Confidence Scoring (Self-Awareness)
Every agent response includes a confidence score. Low confidence triggers human review.

```typescript
// In the orchestrator:
if (response.confidence < 0.5) {
  // Agent is not sure — DON'T proceed automatically
  // Option 1: Ask the Lead Agent to re-plan
  // Option 2: Ask the user for clarification
  // Option 3: Try a simpler approach
  if (response.status === 'needs_clarification') {
    notifyUser(response.output.analysis);
  }
}
```

**Why this prevents hallucination**: An agent that "knows it doesn't know" is safer than one that confidently hallucinates. Low confidence = pause and verify.

### 2.3 Anti-Hallucination Checklist (Applied to Every Agent Turn)

Before any agent output is accepted:
- [ ] Does the output reference only facts from the Project Board?
- [ ] Does the output stay within the agent's domain boundaries?
- [ ] Is the output in structured JSON format?
- [ ] Does the confidence score meet the threshold (> 0.5)?
- [ ] If code was generated, does it reference only existing files/dependencies?
- [ ] If a claim is made, is there evidence in the Board to support it?

---

## 3. THE MEMORY SYSTEM

### 3.1 Why Memory Matters
Without memory, every agent turn starts from zero. The agent might:
- Forget what was already built
- Rebuild something that already exists
- Contradict a previous decision
- Lose track of the original requirements

### 3.2 Three-Layer Memory Architecture

```
┌─────────────────────────────────────────────────┐
│            LAYER 1: PROJECT BOARD               │
│            (Database — Persistent)               │
│                                                 │
│  The single source of truth. Stored in DB.      │
│  Survives restarts. Every agent reads this.     │
│  Contains: PRD, tasks, files, bugs, status      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            LAYER 2: AGENT CONTEXT                │
│            (In-Memory — Per Agent Turn)          │
│                                                 │
│  Built fresh from the Project Board every turn. │
│  Contains only what THIS agent needs.            │
│  This is what goes into the AI prompt.           │
│  NEVER cached — always rebuilt from Board.       │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            LAYER 3: SESSION LOG                  │
│            (Database — Append-Only)              │
│                                                 │
│  Every agent action is logged with:              │
│  - Timestamp, agent, task, input, output         │
│  - Duration, token count, confidence             │
│  Used for debugging and auditing.                │
│  NEVER modified — only appended to.              │
└─────────────────────────────────────────────────┘
```

### 3.3 How Memory Prevents Hallucination

| Problem | Memory Solution |
|---------|----------------|
| Agent forgets what's built | Layer 1: Read file manifest from Board |
| Agent invents requirements | Layer 1: Read PRD from Board |
| Agent contradicts previous decision | Layer 1: Read completed tasks from Board |
| Agent doesn't know what to do next | Layer 1: Read task queue from Board |
| Agent prompt is stale | Layer 2: Rebuilt fresh every turn |
| Agent re-tries a failed approach | Layer 2: Previous approaches included in context |
| Need to debug why something broke | Layer 3: Read full agent log |

### 3.4 Context Window Management

The biggest challenge: AI models have context limits. We can't stuff the entire project into every prompt.

**Solution: Smart Context Selection**

```typescript
function selectContextForAgent(agent: AgentRole, task: Task, board: ProjectBoard): AgentContext {
  return {
    // ALWAYS INCLUDE:
    projectSummary: board.prd?.summary,              // 1-2 sentences
    relevantCompletedTasks: filterRelevant(board.completedTasks, task),  // Only related tasks
    relevantFiles: filterRelevantFiles(board.fileManifest, task),        // Only related files
    openBugs: board.openBugs,                         // All bugs (usually small)
    currentTask: task,                                // The task at hand

    // NEVER INCLUDE:
    // - Full PRD (too long) — use summary
    // - All completed tasks (too many) — filter relevant ones
    // - Full agent log (too long) — only recent entries
    // - Other agents' internal reasoning (unnecessary)
  };
}
```

---

## 4. AGENT DEFINITIONS & BOUNDARIES

### 4.1 Lead CTO Agent

**Role**: Chief Technology Officer — the orchestrator and decision-maker

**Responsibilities**:
1. Receive user's idea and kick off the Business Agent
2. Review PRD and approve/reject
3. Create execution plan from approved PRD
4. Assign tasks to specialist agents
5. Monitor progress and intervene when needed
6. Review agent outputs for quality
7. Resolve conflicts between agents
8. Authorize deployment when QA passes
9. Re-plan when team is stuck

**CAN Write To**: taskQueue, executionPlan, agentLog
**CANNOT Write To**: fileManifest, testResults, deployStatus, prd

**Trigger**: User message OR agent completion event OR agent failure event

**Output Format**:
```typescript
interface CTOOutput {
  plan?: ExecutionPlan;
  taskAssignments?: TaskAssignment[];
  interventions?: Intervention[];
  statusUpdate?: string;  // To user
  decisions?: Decision[];
}
```

**Anti-Hallucination Rules**:
- Cannot create tasks for features not in the PRD
- Cannot mark tasks as done without QA approval
- Cannot deploy without QA gate pass
- Must reference Board state in every decision

---

### 4.2 Business Strategist Agent

**Role**: Senior Business Analyst — translates ideas into specs

**Responsibilities**:
1. Analyze user's idea and research market context
2. Write comprehensive PRD (Product Requirements Document)
3. Define user stories with acceptance criteria
4. Define MVP scope (what's in, what's out)
5. Prioritize features by business value
6. Suggest monetization strategy (for future)

**CAN Write To**: prd, userStories, mvpScope, agentLog
**CANNOT Write To**: fileManifest, taskQueue, testResults, deployStatus

**PRD Structure** (enforced — no free-form):
```typescript
interface PRD {
  projectName: string;
  problemStatement: string;        // What problem does this solve?
  targetUsers: string;             // Who is this for?
  coreFeatures: Feature[];         // What must it do?
  mvpFeatures: string[];           // What's in MVP?
  postMvpFeatures: string[];       // What's later?
  technicalPreferences: string;    // Any tech constraints?
  successCriteria: string[];       // How do we know it works?
}

interface Feature {
  name: string;
  description: string;
  userStories: UserStory[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface UserStory {
  id: string;
  asA: string;           // As a [user type]
  iWant: string;         // I want [feature]
  soThat: string;        // So that [benefit]
  acceptanceCriteria: string[];  // How to verify it works
}
```

**Anti-Hallucination Rules**:
- Cannot define features the user didn't mention (unless explicitly flagged as suggestion)
- Must include acceptance criteria for every feature
- Must separate MVP from post-MVP

---

### 4.3 Frontend Lead Agent

**Role**: Senior Frontend Engineer — React/Next.js specialist

**Responsibilities**:
1. Build React components and pages
2. Implement responsive design with Tailwind CSS
3. Use shadcn/ui components for consistency
4. Handle client-side state management
5. Implement routing and navigation
6. Ensure accessibility standards

**CAN Write To**: fileManifest (files matching: src/components/**, src/app/**/page.tsx, src/app/**/layout.tsx, public/**)
**CANNOT Write To**: API routes, database schema, backend logic

**Code Generation Rules**:
- Must use TypeScript (not JavaScript)
- Must use Tailwind CSS (not inline styles)
- Must use shadcn/ui components where available
- Must include responsive design (mobile-first)
- Must reference the PRD for UI requirements
- Must NOT create API routes — that's Backend's job
- Must NOT write SQL or database queries

**Output Format**:
```typescript
interface FrontendOutput {
  files: FileChange[];
  componentsUsed: string[];      // shadcn components used
  dependencies: string[];        // New npm packages needed
  notesForBackend: string[];     // API endpoints needed
}
```

**Anti-Hallucination Rules**:
- Cannot assume API endpoints exist unless in Backend's completed tasks
- Cannot write to src/app/api/** (that's Backend domain)
- Cannot add dependencies not in the allowed list
- Must list all shadcn/ui components used (for installation)

---

### 4.4 Backend Lead Agent

**Role**: Senior Backend Engineer — API and database specialist

**Responsibilities**:
1. Design database schema (Prisma)
2. Build API routes (Next.js API routes)
3. Implement authentication and authorization
4. Handle data validation and error handling
5. Design RESTful API contracts
6. Implement business logic on the server

**CAN Write To**: fileManifest (files matching: src/app/api/**, prisma/**, src/lib/server/**)
**CANNOT Write To**: UI components, page styling, frontend state

**Code Generation Rules**:
- Must use Prisma ORM for database
- Must use Next.js API routes (not separate server)
- Must include input validation on all endpoints
- Must include error handling with proper status codes
- Must NOT create UI components — that's Frontend's job
- Must align API contracts with Frontend's `notesForBackend`

**Output Format**:
```typescript
interface BackendOutput {
  files: FileChange[];
  apiEndpoints: ApiEndpoint[];    // Documented API contract
  databaseModels: string[];       // Prisma model names
  dependencies: string[];         // New npm packages needed
  environmentVars: string[];      // Env vars needed
}
```

**Anti-Hallucination Rules**:
- Cannot assume UI components exist unless in Frontend's completed tasks
- Cannot write to src/components/** or src/app/**/page.tsx (that's Frontend domain)
- Must document every API endpoint for Frontend to consume
- Must list all environment variables needed

---

### 4.5 QA Engineer Agent

**Role**: Senior QA Engineer — quality gatekeeper

**Responsibilities**:
1. Review all generated code for bugs and issues
2. Run build process (npm run build)
3. Verify TypeScript compilation (no type errors)
4. Check for common security issues
5. Validate API endpoint responses
6. Test responsive design (conceptual — no browser automation in MVP)
7. Report bugs with exact file paths and line numbers
8. Re-test after fixes

**CAN Write To**: testResults, openBugs, resolvedBugs, agentLog
**CANNOT Write To**: fileManifest (QA never modifies code directly)

**QA Checklist** (structured — not free-form):
```typescript
interface QAChecklist {
  buildSucceeds: boolean;          // npm run build exits 0
  typescriptCompiles: boolean;     // No type errors
  noUnusedImports: boolean;        // Clean imports
  apiEndpointsValid: boolean;      // All routes return expected status
  responsiveDesignOk: boolean;     // Mobile-first classes present
  noSecurityIssues: boolean;       // No hardcoded secrets, etc.
  dependenciesResolved: boolean;   // All imports exist
  prdCoverageComplete: boolean;    // All MVP features implemented
}
```

**Output Format**:
```typescript
interface QAOutput {
  checklist: QAChecklist;
  passed: boolean;
  bugs: Bug[];
  suggestions: string[];
}
```

**Anti-Hallucination Rules**:
- Cannot mark a check as PASS without actually running the build
- Bug reports must include exact file path and description
- Cannot fix code directly — must report bugs for responsible agent
- Must reference PRD when checking feature coverage

---

### 4.6 DevOps Lead Agent

**Role**: Senior DevOps Engineer — build, deploy, and ship specialist

**Responsibilities**:
1. Initialize the project (create Next.js app, install dependencies)
2. Run build process (npm run build)
3. Push code to GitHub (via GitHub API)
4. Deploy to Render (via Render API or manual trigger)
5. Test live URL (HTTP request + content verification)
6. Monitor deployment health
7. Handle build/deploy failures with actionable feedback

**CAN Write To**: buildStatus, deployStatus, githubStatus, liveUrl, urlTestResult, agentLog
**CANNOT Write To**: fileManifest (DevOps doesn't write app code)

**DevOps Checklist**:
```typescript
interface DevOpsChecklist {
  projectInitialized: boolean;
  dependenciesInstalled: boolean;
  buildSucceeds: boolean;
  pushedToGithub: boolean;
  deployedToRender: boolean;
  urlReturns200: boolean;
  urlContainsExpectedContent: boolean;
}
```

**Output Format**:
```typescript
interface DevOpsOutput {
  checklist: DevOpsChecklist;
  githubRepoUrl?: string;
  liveUrl?: string;
  urlTestResult?: UrlTestResult;
  buildErrors?: string[];
  deployErrors?: string[];
}

interface UrlTestResult {
  url: string;
  statusCode: number;
  responseTime: number;
  containsExpectedContent: boolean;
  timestamp: Date;
}
```

**Anti-Hallucination Rules**:
- Cannot claim deployment is live without HTTP 200 verification
- Cannot claim GitHub push succeeded without API confirmation
- Must include exact error messages from build/deploy failures
- Must test URL after every deployment

---

## 5. AGENT COMMUNICATION PROTOCOL

### 5.1 Communication Model
Agents do NOT talk to each other directly. All communication goes through the Project Board.

```
❌ WRONG: Frontend Agent → Backend Agent (direct chat)
✅ RIGHT: Frontend Agent → writes to Board → Lead Agent reads → assigns to Backend Agent
```

### 5.2 Message Types

| Message Type | From | To | Purpose |
|-------------|------|----|---------|
| TaskAssignment | Lead | Specialist | Here's your task |
| TaskCompletion | Specialist | Lead | Task is done, here's the output |
| TaskFailure | Specialist | Lead | Task failed, here's why |
| BugReport | QA | Lead | Found bugs in X agent's work |
| BuildResult | DevOps | Lead | Build succeeded/failed |
| DeployResult | DevOps | Lead | Deploy succeeded/failed |
| Intervention | Lead | Specialist | Stop, change approach |
| Replan | Lead | Self | Need to restructure the plan |
| UserUpdate | Lead | User | Here's what's happening |
| UserInput | User | Lead | Clarification / new request |

### 5.3 Communication Flow Example

```
User: "Build me a habit tracker"

1. Lead → Business:  TaskAssignment("Create PRD for habit tracker app")
2. Business → Lead:  TaskCompletion(PRD with 5 features, 12 user stories)
3. Lead → Lead:      Review PRD → APPROVE → Create execution plan
4. Lead → Backend:   TaskAssignment("Design database schema for habits")
5. Lead → Frontend:  TaskAssignment("Build dashboard page layout")
6. Backend → Lead:   TaskCompletion(schema + API endpoints)
7. Frontend → Lead:  TaskCompletion(components + pages)
8. Lead → QA:        TaskAssignment("Review all code, run build")
9. QA → Lead:        BugReport("Login form missing validation")
10. Lead → Frontend: Intervention("Fix login validation, see bug #3")
11. Frontend → Lead: TaskCompletion(fixed login form)
12. Lead → QA:        TaskAssignment("Re-test after fixes")
13. QA → Lead:        TaskCompletion(ALL PASS, 0 critical bugs)
14. Lead → DevOps:    TaskAssignment("Build, push to GitHub, deploy")
15. DevOps → Lead:    TaskCompletion(live at habit-tracker.onrender.com)
16. Lead → User:      UserUpdate("Your app is live! URL: ...")
```

---

## 6. THE ORCHESTRATION ENGINE

### 6.1 The Engine's Job
The orchestration engine is the runtime that:
1. Reads the Project Board state
2. Determines which agent should act next
3. Builds the agent's context from the Board
4. Calls the AI model with the agent's prompt + context
5. Parses the agent's structured response
6. Updates the Project Board with the result
7. Determines the next step
8. Repeats until the project is LIVE

### 6.2 Decision Logic (Simplified)

```typescript
async function orchestrate(board: ProjectBoard): Promise<void> {
  while (board.status !== 'live') {
    const nextAction = determineNextAction(board);

    switch (nextAction.type) {
      case 'run_agent':
        const context = buildAgentContext(nextAction.agent, nextAction.task, board);
        const response = await callAgent(nextAction.agent, context);
        updateBoard(board, response);

        if (response.confidence < 0.5) {
          await notifyUser(`Low confidence on task: ${nextAction.task.description}`);
          await waitForUserInput(); // Pause for human review
        }
        break;

      case 'intervene':
        const intervention = await leadAgentIntervene(board, nextAction.reason);
        updateBoard(board, intervention);
        break;

      case 'notify_user':
        await notifyUser(nextAction.message);
        break;

      case 'wait_for_user':
        await waitForUserInput();
        break;
    }

    board.totalAgentCycles++;

    // Safety: prevent infinite loops
    if (board.totalAgentCycles > 100) {
      await notifyUser('Max cycles reached. Pausing for review.');
      break;
    }
  }
}
```

### 6.3 Next Action Determination

```typescript
function determineNextAction(board: ProjectBoard): NextAction {
  // Priority 1: If no PRD, Business Agent creates one
  if (!board.prd) {
    return { type: 'run_agent', agent: 'business', task: createBusinessTask(board) };
  }

  // Priority 2: If PRD exists but no execution plan, Lead Agent creates one
  if (!board.executionPlan) {
    return { type: 'run_agent', agent: 'cto', task: createPlanTask(board) };
  }

  // Priority 3: If there are pending tasks, assign the next one
  const nextTask = board.taskQueue.find(t => t.status === 'pending');
  if (nextTask) {
    return { type: 'run_agent', agent: nextTask.assignedTo, task: nextTask };
  }

  // Priority 4: If there are in-progress tasks, check for completion
  const inProgress = board.taskQueue.find(t => t.status === 'in_progress');
  if (inProgress) {
    // This shouldn't happen often — tasks should complete in one turn
    return { type: 'run_agent', agent: inProgress.assignedTo, task: inProgress };
  }

  // Priority 5: If all tasks done but not tested, run QA
  if (board.taskQueue.every(t => t.status === 'done') && board.openBugs.length === 0 && !board.testResults.length) {
    return { type: 'run_agent', agent: 'qa', task: createQATask(board) };
  }

  // Priority 6: If QA passed but not deployed, run DevOps
  if (board.testResults.some(r => r.passed) && !board.liveUrl) {
    return { type: 'run_agent', agent: 'devops', task: createDeployTask(board) };
  }

  // Priority 7: If deployed and URL works, we're done
  if (board.liveUrl && board.urlTestResult?.statusCode === 200) {
    board.status = 'live';
    return { type: 'notify_user', message: 'Project is LIVE!' };
  }

  // Priority 8: If stuck, Lead Agent intervenes
  return { type: 'intervene', reason: 'no_clear_next_action' };
}
```

---

## 7. THE AUTONOMOUS LOOP

### 7.1 The Full Lifecycle

```
PHASE 1: DISCOVER
   User describes idea
       │
       ▼
   Business Agent creates PRD
   Lead Agent reviews PRD
       │
       ▼ REJECT → Business Agent revises
       │ PASS
       ▼

PHASE 2: PLAN
   Lead Agent creates execution plan
   Lead Agent creates task queue
       │
       ▼

PHASE 3: BUILD (loops until all tasks done)
   ┌─────────────────────────────────────┐
   │  Lead picks next task               │
   │  Specialist agent executes task      │
   │  Lead reviews output                │
   │  If issues → fix cycle              │
   │  If OK → next task                  │
   │  Repeat until task queue empty       │
   └─────────────────────────────────────┘
       │
       ▼

PHASE 4: TEST (loops until QA passes)
   ┌─────────────────────────────────────┐
   │  QA Agent runs full review          │
   │  If bugs found → report to Lead     │
   │  Lead assigns fix tasks             │
   │  Specialist fixes bugs              │
   │  QA re-tests                        │
   │  Repeat until 0 critical bugs       │
   └─────────────────────────────────────┘
       │
       ▼

PHASE 5: SHIP (loops until live)
   ┌─────────────────────────────────────┐
   │  DevOps builds project              │
   │  If build fails → report errors     │
   │  Lead assigns fix tasks             │
   │  DevOps re-builds                   │
   │  Push to GitHub                     │
   │  Deploy to Render                   │
   │  Test live URL                      │
   │  If URL fails → debug & redeploy    │
   │  Repeat until URL returns 200       │
   └─────────────────────────────────────┘
       │
       ▼

PHASE 6: COMPLETE
   App is live at URL
   User is notified
   Project board marked as 'live'
```

### 7.2 The Safety Guardrails

| Guardrail | Value | Reason |
|-----------|-------|--------|
| Max agent cycles per project | 100 | Prevents infinite loops |
| Max retries per task | 3 | Prevents agent going in circles |
| Max total bugs before replan | 10 | If too many bugs, architecture is wrong |
| Min confidence to proceed | 0.5 | Low confidence = pause |
| Build timeout | 120 seconds | Prevents hanging |
| URL test timeout | 30 seconds | Prevents hanging |
| Deploy wait time | 60 seconds | Give Render time to start |

---

## 8. ERROR HANDLING & RECOVERY

### 8.1 Error Categories

| Category | Example | Recovery |
|----------|---------|----------|
| Agent failure | AI model returns error | Retry once, then Lead intervenes |
| Build failure | npm run build fails | DevOps reports errors, Lead assigns fix |
| Test failure | QA finds bugs | Lead assigns fix to responsible agent |
| Deploy failure | Render deployment fails | DevOps reports errors, Lead assigns fix |
| URL failure | Live URL returns 500 | DevOps reports, Lead assigns investigation |
| Low confidence | Agent returns confidence < 0.5 | Pause, notify user |
| Max retries exceeded | Agent fails 3 times on same task | Lead re-plans with different approach |
| Context overflow | Too much data for AI prompt | Smart context selection (truncate old entries) |
| Rate limit | AI SDK rate limit hit | Wait and retry with backoff |

### 8.2 Recovery Hierarchy

```
Level 1: Auto-retry (1 attempt)
    ↓ If fails
Level 2: Lead Agent intervention (re-assign or simplify)
    ↓ If fails
Level 3: Lead Agent re-plan (different architecture approach)
    ↓ If fails
Level 4: User notification (ask for guidance)
```

---

## 9. TECH STACK & INFRASTRUCTURE

### 9.1 Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Framework | Next.js | 16 | Full-stack, API routes, SSR |
| Language | TypeScript | 5.x | Type safety, prevents runtime errors |
| AI SDK | z-ai-web-dev-sdk | latest | Free AI access |
| Database | SQLite (dev) / PostgreSQL (prod) | - | Lightweight → scalable |
| ORM | Prisma | latest | Type-safe DB access |
| Styling | Tailwind CSS | 4 | Utility-first, fast |
| UI Components | shadcn/ui | latest | Pre-built, accessible |
| Hosting | Render | Free tier | $0 deployment |
| Version Control | GitHub | - | Code hosting + deployment trigger |

### 9.2 Render Configuration

```yaml
# render.yaml
services:
  - type: web
    name: agent-platform
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    env: node
    plan: free
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: agent-db
          property: connectionString

databases:
  - name: agent-db
    plan: free
```

---

## 10. DATABASE SCHEMA

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  description String
  status      String   @default("planning")
  prd         Json?
  executionPlan Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tasks       Task[]
  files       ProjectFile[]
  bugs        Bug[]
  testResults TestResult[]
  agentLogs   AgentLog[]
  deployments Deployment[]
}

model Task {
  id          String   @id @default(cuid())
  projectId   String
  description String
  assignedTo  String   // Agent role
  status      String   @default("pending")
  priority    String   @default("medium")
  retryCount  Int      @default(0)
  maxRetries  Int      @default(3)
  output      Json?
  feedback    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?

  project     Project  @relation(fields: [projectId], references: [id])
}

model ProjectFile {
  id          String   @id @default(cuid())
  projectId   String
  path        String
  content     String
  createdBy   String   // Agent role
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id])
}

model Bug {
  id          String   @id @default(cuid())
  projectId   String
  description String
  filePath    String?
  severity    String   @default("medium")
  status      String   @default("open")
  reportedBy  String   // Agent role
  assignedTo  String?  // Agent role
  resolvedAt  DateTime?

  project     Project  @relation(fields: [projectId], references: [id])
}

model TestResult {
  id          String   @id @default(cuid())
  projectId   String
  testType    String   // "build" | "typecheck" | "api" | "url"
  passed      Boolean
  details     String?
  ranAt       DateTime @default(now())

  project     Project  @relation(fields: [projectId], references: [id])
}

model AgentLog {
  id          String   @id @default(cuid())
  projectId   String
  agentRole   String
  task        String?
  action      String
  input       Json?
  output      Json?
  duration    Int?     // milliseconds
  confidence  Float?
  createdAt   DateTime @default(now())

  project     Project  @relation(fields: [projectId], references: [id])
}

model Deployment {
  id          String   @id @default(cuid())
  projectId   String
  platform    String   @default("render")
  status      String   @default("pending")
  url         String?
  githubRepo  String?
  deployedAt  DateTime?

  project     Project  @relation(fields: [projectId], references: [id])
}
```

---

## 11. FILE STRUCTURE

```
agent-platform/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Home — Chat interface
│   │   ├── globals.css
│   │   ├── project/
│   │   │   └── [id]/
│   │   │       └── page.tsx              # Project dashboard
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts              # Chat endpoint
│   │       ├── project/
│   │       │   └── route.ts              # Project CRUD
│   │       ├── agent/
│   │       │   └── execute/
│   │       │       └── route.ts          # Agent execution endpoint
│   │       └── deploy/
│   │           └── route.ts              # Deployment endpoint
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── base-agent.ts             # Base agent class
│   │   │   ├── lead-cto.ts              # Lead CTO agent
│   │   │   ├── frontend-lead.ts         # Frontend specialist
│   │   │   ├── backend-lead.ts          # Backend specialist
│   │   │   ├── qa-engineer.ts           # QA specialist
│   │   │   ├── devops-lead.ts           # DevOps specialist
│   │   │   └── business-strategist.ts   # Business strategist
│   │   ├── engine/
│   │   │   ├── orchestrator.ts          # The main orchestration loop
│   │   │   ├── context-builder.ts       # Builds agent context from Board
│   │   │   ├── response-parser.ts       # Parses structured agent responses
│   │   │   └── board-manager.ts         # Reads/writes Project Board
│   │   ├── integrations/
│   │   │   ├── ai-sdk.ts               # z-ai-web-dev-sdk wrapper
│   │   │   ├── github.ts               # GitHub API integration
│   │   │   └── render.ts               # Render deployment
│   │   ├── validators/
│   │   │   ├── prd-validator.ts         # Validates PRD structure
│   │   │   ├── code-validator.ts        # Validates generated code
│   │   │   └── deploy-validator.ts      # Validates deployment
│   │   └── types/
│   │       ├── agent.ts                 # Agent types
│   │       ├── project.ts               # Project/Board types
│   │       └── api.ts                   # API types
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx        # Main chat UI
│   │   │   ├── MessageBubble.tsx        # Chat messages
│   │   │   └── AgentStatus.tsx          # Agent activity indicator
│   │   ├── project/
│   │   │   ├── ProjectDashboard.tsx     # Project overview
│   │   │   ├── TaskBoard.tsx           # Kanban-style task view
│   │   │   ├── AgentMonitor.tsx        # Live agent activity
│   │   │   ├── CodeViewer.tsx          # View generated code
│   │   │   └── DeploymentStatus.tsx    # Deploy status
│   │   └── ui/                          # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       └── ...
│   └── hooks/
│       ├── use-project.ts               # Project state hook
│       ├── use-agent-stream.ts          # SSE streaming hook
│       └── use-agent-log.ts             # Agent log hook
├── prisma/
│   └── schema.prisma
├── public/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── render.yaml
```

---

## 12. IMPLEMENTATION PHASES

### PHASE 1: Foundation (Build First, Make It Work)
**Goal**: Core engine + Lead Agent + Chat UI — prove the concept

**Deliverables**:
- [ ] Next.js project initialized
- [ ] Database schema created (Prisma + SQLite)
- [ ] Base Agent class with structured output parsing
- [ ] Lead CTO Agent (basic — can plan and delegate)
- [ ] Simple chat UI (user types, Lead responds)
- [ ] Project Board read/write
- [ ] Basic orchestration loop (Lead Agent only)

**Test**: User types an idea → Lead Agent creates a plan and shows it

### PHASE 2: Builders (Frontend + Backend Agents)
**Goal**: Agents that can actually generate code

**Deliverables**:
- [ ] Frontend Lead Agent (generates React components)
- [ ] Backend Lead Agent (generates API routes + schema)
- [ ] Code file writing (agents write to project directory)
- [ ] Agent context builder (smart context selection)
- [ ] Lead Agent task assignment to specialists
- [ ] Updated chat UI to show agent activity

**Test**: User types an idea → Lead delegates → Frontend/Backend generate code → files appear

### PHASE 3: Quality (QA Agent)
**Goal**: Nothing passes without validation

**Deliverables**:
- [ ] QA Engineer Agent (code review + build testing)
- [ ] Build execution (npm run build from agent)
- [ ] Bug reporting with file paths
- [ ] Fix cycle (bugs → Lead assigns → specialist fixes → QA re-tests)
- [ ] QA checklist validation

**Test**: Agent generates code with a bug → QA catches it → Fix is applied → Build passes

### PHASE 4: Shipping (DevOps Agent)
**Goal**: Code goes from local to live URL

**Deliverables**:
- [ ] DevOps Lead Agent
- [ ] GitHub API integration (push to repo)
- [ ] Render deployment (trigger + monitor)
- [ ] Live URL testing (HTTP request + content verification)
- [ ] Deployment status tracking

**Test**: All code passes QA → DevOps pushes to GitHub → Deploys to Render → URL returns 200

### PHASE 5: Strategy (Business Agent)
**Goal**: Ideas become professional product specs

**Deliverables**:
- [ ] Business Strategist Agent
- [ ] PRD generation (structured, validated)
- [ ] User story creation
- [ ] MVP scope definition
- [ ] Feature prioritization
- [ ] PRD validation (completeness check)

**Test**: User types vague idea → Business Agent creates full PRD → Lead reviews → Plan created

### PHASE 6: Autonomy (The Full Loop)
**Goal**: End-to-end autonomous execution

**Deliverables**:
- [ ] Full autonomous loop (all phases connected)
- [ ] Error recovery (all 4 levels)
- [ ] Safety guardrails (max cycles, max retries, timeouts)
- [ ] Confidence scoring enforcement
- [ ] User notifications at milestones
- [ ] Complete project dashboard UI

**Test**: User types "Build me a habit tracker" → System runs autonomously → App is live at URL

### PHASE 7: Polish (Make It Beautiful)
**Goal**: Production-quality experience

**Deliverables**:
- [ ] Beautiful chat UI with agent avatars
- [ ] Real-time agent activity stream (SSE)
- [ ] Kanban task board
- [ ] Code viewer with syntax highlighting
- [ ] Deployment status with progress indicators
- [ ] Mobile-responsive design
- [ ] Error states and empty states

**Test**: Full user experience is smooth, informative, and beautiful

---

## 13. RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI model rate limits | High | Medium | Exponential backoff + caching + smart context |
| Agent hallucination | Medium | Critical | 7-layer anti-hallucination system |
| Build always fails | Medium | High | QA gate + fix cycle + max retries |
| Context window overflow | Medium | High | Smart context selection + summarization |
| GitHub API limits | Low | Medium | Batch operations + rate limit awareness |
| Render cold starts | High | Low | Accept as free-tier limitation |
| SQLite concurrency | Low | Medium | File locking + sequential writes |
| Agents contradict each other | Medium | High | Shared Project Board + Lead Agent arbitration |

---

## 14. SUCCESS CRITERIA

The prototype is successful when:

- [ ] User can type an app idea in natural language
- [ ] Business Agent creates a complete PRD
- [ ] Lead Agent creates an execution plan
- [ ] Frontend Agent generates working React components
- [ ] Backend Agent generates working API routes + schema
- [ ] QA Agent catches bugs and enforces quality
- [ ] DevOps Agent builds, pushes to GitHub, and deploys
- [ ] The live URL returns HTTP 200 with expected content
- [ ] The entire process runs autonomously (minimal user intervention)
- [ ] No agent hallucinates — all outputs are grounded in the Project Board
- [ ] Error recovery works — the system self-corrects from failures

---

## 15. APPENDIX: AGENT SYSTEM PROMPTS

### 15.1 Lead CTO Agent — System Prompt

```
You are the Lead CTO Agent — the orchestrator of an autonomous
software development team. You are a senior CTO with 20+ years
of experience leading engineering teams.

YOUR ROLE:
- Interpret the user's vision
- Review and approve the PRD
- Create execution plans
- Delegate tasks to specialist agents
- Monitor progress and quality
- Intervene when agents are stuck
- Approve deployment
- Ensure the final product works end-to-end

YOUR TEAM:
- Business Strategist: Creates PRDs and defines features
- Frontend Lead: Builds React/Next.js UI
- Backend Lead: Builds APIs and database
- QA Engineer: Tests and validates
- DevOps Lead: Builds, deploys, tests URLs

RULES:
1. You ONLY reference information from the Project Board
2. You NEVER invent features not in the PRD
3. You NEVER approve deployment without QA pass
4. You ALWAYS intervene when an agent exceeds max retries
5. You ALWAYS notify the user at major milestones
6. You prefer SIMPLE working solutions over COMPLEX broken ones
7. You NEVER stop until the app is live and the URL works
8. If the team is stuck for 3+ cycles, you RE-PLAN

OUTPUT FORMAT:
Return structured JSON matching the CTOOutput schema.
```

### 15.2 Business Strategist Agent — System Prompt

```
You are the Business Strategist Agent — a senior product manager
and business analyst. You translate ideas into professional product
specifications.

YOUR ROLE:
- Analyze the user's idea
- Research market context (if needed)
- Write a comprehensive PRD
- Define user stories with acceptance criteria
- Define MVP scope
- Prioritize features by business value

RULES:
1. You ONLY write to: prd, userStories, mvpScope
2. You NEVER write code or modify files
3. Every feature MUST have acceptance criteria
4. You MUST separate MVP from post-MVP features
5. You MUST NOT invent features the user didn't mention
  (suggestions are OK if clearly marked as such)
6. Your PRD MUST follow the PRD schema exactly
7. If the user's idea is vague, ask clarifying questions
  through the Lead Agent

OUTPUT FORMAT:
Return structured JSON matching the BusinessOutput schema.
```

### 15.3 Frontend Lead Agent — System Prompt

```
You are the Frontend Lead Agent — a senior frontend engineer
specializing in React, Next.js, and Tailwind CSS. You write
production-quality UI code.

YOUR ROLE:
- Build React components and pages
- Implement responsive design (mobile-first)
- Use shadcn/ui components
- Handle client-side state
- Implement routing and navigation

RULES:
1. You ONLY write to: src/components/**, src/app/**/page.tsx,
   src/app/**/layout.tsx, public/**
2. You NEVER write API routes (src/app/api/**)
3. You NEVER write database queries or server logic
4. You MUST use TypeScript
5. You MUST use Tailwind CSS
6. You MUST use shadcn/ui where possible
7. You MUST list all new dependencies
8. You MUST list API endpoints you need from Backend
9. You CANNOT assume API endpoints exist unless listed
   in the Project Board's completed backend tasks

OUTPUT FORMAT:
Return structured JSON matching the FrontendOutput schema.
```

### 15.4 Backend Lead Agent — System Prompt

```
You are the Backend Lead Agent — a senior backend engineer
specializing in Next.js API routes and Prisma ORM. You write
production-quality server code.

YOUR ROLE:
- Design database schema (Prisma)
- Build API routes (Next.js API routes)
- Implement authentication
- Handle validation and error handling
- Design RESTful API contracts

RULES:
1. You ONLY write to: src/app/api/**, prisma/**, src/lib/server/**
2. You NEVER write UI components or pages
3. You MUST use Prisma ORM for database
4. You MUST use Next.js API routes
5. You MUST include input validation on all endpoints
6. You MUST include error handling with proper status codes
7. You MUST document all API endpoints
8. You MUST list all environment variables needed
9. You CANNOT assume UI components exist unless listed
   in the Project Board's completed frontend tasks

OUTPUT FORMAT:
Return structured JSON matching the BackendOutput schema.
```

### 15.5 QA Engineer Agent — System Prompt

```
You are the QA Engineer Agent — a senior quality assurance
engineer. You are ruthless about quality and never let bugs
slip through.

YOUR ROLE:
- Review all generated code
- Run build process (verify it compiles)
- Check for common bugs and security issues
- Validate API contracts
- Report bugs with exact file paths
- Re-test after fixes

RULES:
1. You ONLY write to: testResults, openBugs, resolvedBugs
2. You NEVER modify code directly
3. Bug reports MUST include exact file path and description
4. You CANNOT mark a check PASS without verification
5. You MUST reference the PRD when checking feature coverage
6. You MUST run the build before reporting success
7. You are the GATEKEEPER — nothing ships without your approval
8. If uncertain, flag as NEEDS_REVIEW rather than PASS

OUTPUT FORMAT:
Return structured JSON matching the QAOutput schema.
```

### 15.6 DevOps Lead Agent — System Prompt

```
You are the DevOps Lead Agent — a senior DevOps engineer
specializing in CI/CD, GitHub, and cloud deployment. You
ensure code goes from local to live.

YOUR ROLE:
- Initialize project and install dependencies
- Run build process
- Push code to GitHub
- Deploy to Render
- Test live URL
- Monitor deployment health
- Report build/deploy failures

RULES:
1. You ONLY write to: buildStatus, deployStatus, githubStatus,
   liveUrl, urlTestResult
2. You NEVER modify application code
3. You CANNOT claim deployment is live without HTTP 200
4. You CANNOT claim GitHub push succeeded without confirmation
5. You MUST include exact error messages from failures
6. You MUST test the URL after every deployment
7. You MUST wait for Render to start before testing URL
8. If build fails, report exact error for Lead to assign fixes

OUTPUT FORMAT:
Return structured JSON matching the DevOpsOutput schema.
```

---

## CHANGE LOG

| Date | Version | Change |
|------|---------|--------|
| 2026-05-24 | 1.0 | Initial Master Plan created |

---

> ⚠️ THIS DOCUMENT IS THE SINGLE SOURCE OF TRUTH.
> Any deviation from this plan MUST be documented in the change log.
> If it's not here, it doesn't exist.
