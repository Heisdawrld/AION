// AION — Core Types
// Every type used across the system is defined here.

// ============================================================
// AGENT TYPES
// ============================================================

export type AgentRole = 'cto' | 'frontend' | 'backend' | 'qa' | 'devops' | 'business';

export const AGENT_ROLES: AgentRole[] = ['cto', 'frontend', 'backend', 'qa', 'devops', 'business'];

export const AGENT_NAMES: Record<AgentRole, string> = {
  cto: 'Lead CTO',
  frontend: 'Frontend Lead',
  backend: 'Backend Lead',
  qa: 'QA Engineer',
  devops: 'DevOps Lead',
  business: 'Business Strategist',
};

export const AGENT_EMOJIS: Record<AgentRole, string> = {
  cto: '🎯',
  frontend: '🎨',
  backend: '⚙️',
  qa: '🧪',
  devops: '🚀',
  business: '💼',
};

export const AGENT_COLORS: Record<AgentRole, string> = {
  cto: '#f59e0b',    // amber
  frontend: '#8b5cf6', // violet
  backend: '#10b981',  // emerald
  qa: '#ef4444',      // red
  devops: '#3b82f6',   // blue
  business: '#f97316', // orange
};

// Agent write boundaries — what each agent can write to
export const AGENT_WRITE_ACCESS: Record<AgentRole, string[]> = {
  cto: ['taskQueue', 'executionPlan', 'agentLog'],
  frontend: ['fileManifest:frontend'],
  backend: ['fileManifest:backend'],
  qa: ['testResults', 'openBugs', 'resolvedBugs', 'agentLog'],
  devops: ['buildStatus', 'deployStatus', 'githubStatus', 'liveUrl', 'urlTestResult', 'agentLog'],
  business: ['prd', 'userStories', 'mvpScope', 'agentLog'],
};

export const AGENT_DENIED_ACCESS: Record<AgentRole, string[]> = {
  cto: ['fileManifest', 'testResults', 'deployStatus', 'prd'],
  frontend: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
  backend: ['src/components/**', 'src/app/**/page.tsx', 'testResults', 'deployStatus'],
  qa: ['fileManifest'],
  devops: ['fileManifest'],
  business: ['fileManifest', 'taskQueue', 'testResults', 'deployStatus'],
};

// ============================================================
// AGENT RESPONSE TYPES (Structured Output — Layer 1 Anti-Hallucination)
// ============================================================

export interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  description: string;
}

export interface Bug {
  id: string;
  description: string;
  filePath?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'assigned' | 'fixing' | 'resolved';
  reportedBy: AgentRole;
  assignedTo?: AgentRole;
}

export interface Decision {
  decision: string;
  reasoning: string;
  basedOn: string; // What Board data supports this decision
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

export interface TestResultOutput {
  testType: string;
  passed: boolean;
  details?: string;
}

export interface UrlTestResult {
  url: string;
  statusCode: number;
  responseTime: number;
  containsExpectedContent: boolean;
  timestamp: string;
}

export interface AgentResponse {
  agentId: AgentRole;
  taskId: string;
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    files?: FileChange[];
    analysis?: string;
    decisions?: Decision[];
    bugs?: Bug[];
    testResults?: TestResultOutput[];
    apiEndpoints?: ApiEndpoint[];
    statusUpdate?: string; // Message to user
    taskAssignments?: TaskAssignment[];
    nextSteps?: string[];
  };
  confidence: number; // 0-1
  dependencies?: string[];
}

// ============================================================
// PRD TYPES (Business Agent Output)
// ============================================================

export interface PRD {
  projectName: string;
  problemStatement: string;
  targetUsers: string;
  coreFeatures: Feature[];
  mvpFeatures: string[];
  postMvpFeatures: string[];
  technicalPreferences: string;
  successCriteria: string[];
  summary: string; // 1-2 sentence summary for context
}

export interface Feature {
  name: string;
  description: string;
  userStories: UserStory[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface UserStory {
  id: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
}

// ============================================================
// EXECUTION PLAN TYPES (Lead CTO Output)
// ============================================================

export interface ExecutionPlan {
  phases: PlanPhase[];
  estimatedTasks: number;
  riskAssessment: string;
  approach: string; // The overall technical approach
}

export interface PlanPhase {
  name: string;
  description: string;
  tasks: TaskDefinition[];
}

export interface TaskDefinition {
  description: string;
  assignedTo: AgentRole;
  priority: 'critical' | 'high' | 'medium' | 'low';
  phase: 'discover' | 'plan' | 'build' | 'test' | 'ship';
  dependsOn?: string[]; // Task indices
}

export interface TaskAssignment {
  taskDescription: string;
  assignedTo: AgentRole;
  priority: 'critical' | 'high' | 'medium' | 'low';
  phase: 'discover' | 'plan' | 'build' | 'test' | 'ship';
  context: string; // What the agent needs to know
}

// ============================================================
// PROJECT BOARD TYPES
// ============================================================

export type ProjectStatus = 'planning' | 'building' | 'testing' | 'deploying' | 'live' | 'failed';
export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'failed';
export type BuildStatus = 'never' | 'building' | 'success' | 'failed';
export type DeployStatus = 'never' | 'deploying' | 'deployed' | 'failed';

export interface ProjectBoardState {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  prd: PRD | null;
  executionPlan: ExecutionPlan | null;
  completedTaskCount: number;
  pendingTaskCount: number;
  openBugCount: number;
  fileCount: number;
  buildStatus: BuildStatus;
  deployStatus: DeployStatus;
  liveUrl: string | null;
  totalCycles: number;
  lastActivityAt: string;
}

// ============================================================
// ORCHESTRATOR TYPES
// ============================================================

export type NextActionType = 'run_agent' | 'intervene' | 'notify_user' | 'wait_for_user' | 'complete';

export interface NextAction {
  type: NextActionType;
  agent?: AgentRole;
  task?: string;
  reason?: string;
  message?: string;
}

// ============================================================
// CHAT TYPES
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentRole?: AgentRole;
  agentName?: string;
  agentEmoji?: string;
  timestamp: string;
  projectId?: string;
  metadata?: {
    taskAssignments?: TaskAssignment[];
    confidence?: number;
    status?: ProjectStatus;
  };
}

export interface AgentActivity {
  id: string;
  agentRole: AgentRole;
  agentName: string;
  agentEmoji: string;
  action: string;
  task?: string;
  timestamp: string;
  confidence?: number;
  status: 'working' | 'success' | 'failed' | 'waiting';
}

// ============================================================
// CONVERSATION TYPES
// ============================================================

export type ConversationRole = 'user' | 'cto' | 'system';

export interface ConversationMessage {
  id: string;
  projectId: string;
  role: ConversationRole;
  content: string;
  agentRole?: AgentRole;
  metadata?: {
    taskAssignments?: TaskAssignment[];
    confidence?: number;
    status?: ProjectStatus;
    actionType?: string;
  };
  createdAt: string;
}

export interface ChatResponse {
  projectId: string;
  message: string;
  agentResponses: {
    agentId: string;
    status: string;
    statusUpdate?: string;
    analysis?: string;
    confidence: number;
    taskAssignments?: TaskAssignment[];
    filesCount: number;
    bugsCount?: number;
    actionType?: string;
  }[];
  projectStatus: string;
  liveUrl?: string;
  phase?: string;
  cycleCount?: number;
  conversationId?: string;
}
