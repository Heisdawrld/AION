// AION — Core Types
// Every type used across the system is defined here.

// ============================================================
// AGENT TYPES
// ============================================================

export type AgentRole = 'cto' | 'frontend' | 'backend' | 'qa' | 'devops' | 'business' | 'research' | 'security' | 'design' | 'data' | 'docs' | 'analytics' | 'integration';

export const AGENT_ROLES: AgentRole[] = ['cto', 'frontend', 'backend', 'qa', 'devops', 'business', 'research', 'security', 'design', 'data', 'docs', 'analytics', 'integration'];

export const AGENT_NAMES: Record<AgentRole, string> = {
  cto: 'Lead CTO',
  frontend: 'Frontend Lead',
  backend: 'Backend Lead',
  qa: 'QA Engineer',
  devops: 'DevOps Lead',
  business: 'Business Strategist',
  research: 'Research Analyst',
  security: 'Security Engineer',
  design: 'Design Architect',
  data: 'Data Engineer',
  docs: 'Documentation Lead',
  analytics: 'Analytics Engineer',
  integration: 'Integration Specialist',
};

export const AGENT_EMOJIS: Record<AgentRole, string> = {
  cto: '🎯',
  frontend: '🎨',
  backend: '⚙️',
  qa: '🧪',
  devops: '🚀',
  business: '💼',
  research: '🔍',
  security: '🛡️',
  design: '✏️',
  data: '🗄️',
  docs: '📖',
  analytics: '📊',
  integration: '🔗',
};

export const AGENT_COLORS: Record<AgentRole, string> = {
  cto: '#f59e0b',       // amber
  frontend: '#8b5cf6',  // violet
  backend: '#10b981',   // emerald
  qa: '#ef4444',        // red
  devops: '#3b82f6',    // blue
  business: '#f97316',  // orange
  research: '#06b6d4',  // cyan
  security: '#dc2626',  // red-600
  design: '#ec4899',    // pink
  data: '#14b8a6',      // teal
  docs: '#6366f1',      // indigo
  analytics: '#84cc16', // lime
  integration: '#a855f7', // purple
};

// Agent write boundaries — what each agent can write to
export const AGENT_WRITE_ACCESS: Record<AgentRole, string[]> = {
  cto: ['taskQueue', 'executionPlan', 'agentLog'],
  frontend: ['fileManifest:frontend'],
  backend: ['fileManifest:backend'],
  qa: ['testResults', 'openBugs', 'resolvedBugs', 'agentLog'],
  devops: ['buildStatus', 'deployStatus', 'githubStatus', 'liveUrl', 'urlTestResult', 'agentLog'],
  business: ['prd', 'userStories', 'mvpScope', 'agentLog', 'readme', 'statusReports', 'deploymentNotifications'],
  research: ['researchData', 'marketInsights', 'competitorAnalysis', 'agentLog'],
  security: ['securityAudit', 'vulnerabilityReport', 'agentLog'],
  design: ['fileManifest:design', 'designSystem', 'agentLog'],
  data: ['fileManifest:data', 'schemaMigrations', 'agentLog'],
  docs: ['fileManifest:docs', 'apiDocs', 'agentLog'],
  analytics: ['fileManifest:analytics', 'trackingSetup', 'agentLog'],
  integration: ['fileManifest:integration', 'apiIntegrations', 'agentLog'],
};

export const AGENT_DENIED_ACCESS: Record<AgentRole, string[]> = {
  cto: ['fileManifest', 'testResults', 'deployStatus', 'prd'],
  frontend: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
  backend: ['src/components/**', 'src/app/**/page.tsx', 'testResults', 'deployStatus'],
  qa: ['fileManifest'],
  devops: ['fileManifest'],
  business: ['fileManifest', 'taskQueue', 'testResults', 'deployStatus'],
  research: ['fileManifest', 'taskQueue', 'deployStatus'],
  security: ['fileManifest:frontend', 'fileManifest:backend', 'taskQueue'],
  design: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
  data: ['src/components/**', 'src/app/**/page.tsx', 'deployStatus'],
  docs: ['src/app/api/**', 'prisma/**', 'deployStatus'],
  analytics: ['src/app/api/**', 'prisma/**', 'src/components/**', 'deployStatus'],
  integration: ['src/components/**', 'src/app/**/page.tsx', 'testResults'],
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
    qaGateResult?: QAGateResult;
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

// ============================================================
// QA GATE TYPES (Validation Gate — Layer 4 Anti-Hallucination)
// ============================================================

export type QAGateStatus = 'pass' | 'fail' | 'conditional_pass' | 'blocked';

export interface QAChecklist {
  buildSucceeds: boolean;
  typescriptCompiles: boolean;
  noUnusedImports: boolean;
  apiEndpointsValid: boolean;
  responsiveDesignOk: boolean;
  noSecurityIssues: boolean;
  dependenciesResolved: boolean;
  prdCoverageComplete: boolean;
}

export interface QAGateResult {
  gateStatus: QAGateStatus;
  checklist: QAChecklist;
  canDeploy: boolean; // true only if gateStatus is 'pass' or 'conditional_pass'
  criticalBugCount: number;
  highBugCount: number;
  mediumBugCount: number;
  lowBugCount: number;
  buildPassed: boolean;
  typeCheckPassed: boolean;
  lintPassed: boolean;
  buildErrors?: string[];
  typeErrors?: string[];
  lintErrors?: string[];
  summary: string;
}

export interface BuildTestResult {
  buildSuccess: boolean;
  buildOutput?: string;
  buildErrors?: string[];
  buildDuration?: number;
  typeCheckSuccess: boolean;
  typeCheckErrors?: string[];
  lintSuccess: boolean;
  lintWarnings?: string[];
  lintErrors?: string[];
  timestamp: string;
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

// ============================================================
// DEVOPS TYPES (Deployment Pipeline — Phase 4)
// ============================================================

export interface DevOpsChecklist {
  projectInitialized: boolean;
  dependenciesInstalled: boolean;
  buildSucceeds: boolean;
  gitInitialized: boolean;
  gitCommitted: boolean;
  readyForGithub: boolean;
  deploymentConfigured: boolean;
  readyForDeploy: boolean;
  urlReturns200: boolean;
  urlContainsExpectedContent: boolean;
}

export interface GitOperationResult {
  success: boolean;
  operation: 'init' | 'add' | 'commit' | 'push';
  message: string;
  duration: number;
  error?: string;
}

export interface DeploymentResult {
  success: boolean;
  platform: string;
  buildVerified: boolean;
  gitReady: boolean;
  urlTested: boolean;
  urlTestResult?: UrlTestResult;
  deploymentUrl?: string;
  errors: string[];
  warnings: string[];
  checklist: DevOpsChecklist;
  summary: string;
}

// ============================================================
// BUSINESS TYPES (Business Agent — Phase 5)
// ============================================================

export type BusinessActionType =
  | 'create_prd'
  | 'revise_prd'
  | 'generate_readme'
  | 'status_report'
  | 'deployment_notification'
  | 'feature_tracking'
  | 'risk_assessment'
  | 'stakeholder_summary';

export interface FeatureTrackingResult {
  /** Total features defined in PRD */
  totalFeatures: number;
  /** MVP features marked as done */
  mvpFeaturesComplete: number;
  /** MVP features still pending/in-progress */
  mvpFeaturesRemaining: number;
  /** Post-MVP features completed */
  postMvpFeaturesComplete: number;
  /** Percentage of MVP features complete (0-100) */
  mvpCompletionPercent: number;
  /** Percentage of all features complete (0-100) */
  overallCompletionPercent: number;
  /** Per-feature status breakdown */
  featureStatuses: FeatureStatusEntry[];
  /** Assessment of whether MVP is on track */
  mvpReadiness: 'on_track' | 'at_risk' | 'behind' | 'complete';
  /** What's blocking MVP completion, if anything */
  blockers: string[];
}

export interface FeatureStatusEntry {
  featureName: string;
  isMvp: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'not_started' | 'in_progress' | 'complete' | 'blocked';
  hasBugs: boolean;
  userStoriesComplete: number;
  userStoriesTotal: number;
}

export interface ProjectStatusReport {
  /** Project name and summary */
  projectName: string;
  /** Current project status */
  status: ProjectStatus;
  /** Human-readable summary of what's happened */
  summary: string;
  /** Feature tracking against the PRD */
  featureTracking: FeatureTrackingResult;
  /** Key metrics */
  metrics: ProjectMetrics;
  /** Top risks and concerns */
  risks: RiskEntry[];
  /** What's been accomplished recently */
  recentAccomplishments: string[];
  /** What needs to happen next */
  nextSteps: string[];
  /** Overall health assessment */
  health: 'healthy' | 'warning' | 'critical';
  /** Timestamp */
  generatedAt: string;
}

export interface ProjectMetrics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  failedTasks: number;
  openBugs: number;
  criticalBugs: number;
  totalFiles: number;
  totalAgentCycles: number;
  daysSinceCreation: number;
  /** Average confidence across agent responses */
  averageConfidence: number;
}

export interface RiskEntry {
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'schedule' | 'quality' | 'scope' | 'technical' | 'resource';
  mitigation: string;
}

export interface DeploymentNotification {
  /** Project name */
  projectName: string;
  /** Live URL */
  liveUrl: string;
  /** Platform deployed to */
  platform: string;
  /** When it went live */
  deployedAt: string;
  /** What features are included */
  mvpFeaturesIncluded: string[];
  /** Known issues / post-MVP items */
  knownLimitations: string[];
  /** Non-technical summary for stakeholders */
  stakeholderSummary: string;
  /** Next milestone */
  nextMilestone: string;
}

export interface READMEContent {
  /** The full markdown content */
  markdown: string;
  /** Sections included */
  sections: string[];
}

export interface BusinessReportOutput {
  actionType: BusinessActionType;
  statusReport?: ProjectStatusReport;
  featureTracking?: FeatureTrackingResult;
  deploymentNotification?: DeploymentNotification;
  readme?: READMEContent;
  risks?: RiskEntry[];
}

// ============================================================
// RESEARCH TYPES (Research Agent — Web Search & Scraping)
// ============================================================

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  source: string;
  relevanceScore: number;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  scrapedAt: string;
}

export interface ResearchReport {
  topic: string;
  searchQueries: string[];
  sourcesFound: number;
  sourcesAnalyzed: number;
  keyFindings: string[];
  competitorInsights: CompetitorInsight[];
  marketData: MarketDataPoint[];
  technicalReferences: TechnicalReference[];
  recommendations: string[];
  confidence: number;
}

export interface CompetitorInsight {
  name: string;
  url: string;
  strengths: string[];
  weaknesses: string[];
  features: string[];
  pricing?: string;
}

export interface MarketDataPoint {
  metric: string;
  value: string;
  source: string;
  date?: string;
}

export interface TechnicalReference {
  technology: string;
  documentationUrl: string;
  version?: string;
  keyCapabilities: string[];
  integrationComplexity: 'low' | 'medium' | 'high';
}

// ============================================================
// SECURITY TYPES (Security Agent — Audits & Vulnerability Scanning)
// ============================================================

export interface SecurityAuditResult {
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  vulnerabilities: SecurityVulnerability[];
  owaspCompliance: OWASPCheck[];
  secretsScanned: boolean;
  secretsFound: number;
  dependenciesScanned: boolean;
  vulnerableDependencies: number;
  headersScore: number;
  score: number;
}

export interface SecurityVulnerability {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'injection' | 'auth' | 'xss' | 'csrf' | 'secrets' | 'deps' | 'headers' | 'config' | 'dos' | 'other';
  filePath?: string;
  line?: number;
  cwe?: string;
  remediation: string;
  evidence?: string;
}

export interface OWASPCheck {
  category: string;
  categoryCode: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  details: string;
}

// ============================================================
// DESIGN TYPES (Design Agent — UI/UX, Design Systems)
// ============================================================

export interface DesignSystemSpec {
  colors: ColorToken[];
  typography: TypographySpec;
  spacing: SpacingScale;
  borderRadius: string[];
  shadows: string[];
  components: ComponentSpec[];
}

export interface ColorToken {
  name: string;
  value: string;
  usage: string;
}

export interface TypographySpec {
  fonts: { family: string; weights: number[] }[];
  headingScale: { name: string; size: string; weight: number; lineHeight: string }[];
  bodyScale: { name: string; size: string; weight: number; lineHeight: string }[];
}

export interface SpacingScale {
  values: { name: string; value: string; pixels: number }[];
}

export interface ComponentSpec {
  name: string;
  variants: string[];
  states: string[];
  description: string;
}

// ============================================================
// DATA ENGINEER TYPES (Data Agent — DB, Migrations, Pipelines)
// ============================================================

export interface SchemaAnalysis {
  models: SchemaModel[];
  relationships: SchemaRelationship[];
  indexes: SchemaIndex[];
  missingIndexes: SchemaIndex[];
  nPlusOneRisks: string[];
  migrationPlan?: string;
}

export interface SchemaModel {
  name: string;
  fields: number;
  hasTimestamps: boolean;
  hasSoftDelete: boolean;
  relationships: string[];
}

export interface SchemaRelationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  indexed: boolean;
}

export interface SchemaIndex {
  table: string;
  fields: string[];
  type: 'unique' | 'btree' | 'composite';
  reason: string;
}

// ============================================================
// ANALYTICS TYPES (Analytics Agent — Metrics, Tracking, A/B)
// ============================================================

export interface AnalyticsSetup {
  trackingPlan: TrackingEvent[];
  dashboards: DashboardSpec[];
  abTests: ABTestSpec[];
  metrics: MetricDefinition[];
}

export interface TrackingEvent {
  name: string;
  description: string;
  properties: { name: string; type: string; required: boolean }[];
  trigger: string;
}

export interface DashboardSpec {
  name: string;
  metrics: string[];
  filters: string[];
  refreshInterval: string;
}

export interface ABTestSpec {
  name: string;
  hypothesis: string;
  controlVariant: string;
  testVariant: string;
  targetMetric: string;
  minSampleSize: number;
  duration: string;
}

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'ratio';
  description: string;
  unit?: string;
}
