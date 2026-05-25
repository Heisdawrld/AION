// AION — Business Strategist Agent (Enhanced — Phase 5)
// Senior product manager — no fluff, opinionated features, real PRDs.
// NOW WITH: Project summaries, status reports, deployment notifications,
// README generation, feature tracking, risk assessment, and stakeholder communication.
// The Business Agent is the VOICE of the project — from idea to live deployment.

import { BaseAgent } from './base-agent';
import { db } from '@/lib/db';
import type {
  AgentResponse,
  PRD,
  Feature,
  UserStory,
  BusinessActionType,
  FeatureTrackingResult,
  FeatureStatusEntry,
  ProjectStatusReport,
  ProjectMetrics,
  RiskEntry,
  DeploymentNotification,
  READMEContent,
  FileChange,
} from '@/lib/types/aion';

// ============================================================
// THE BUSINESS STRATEGIST — BRUTALLY HONEST, OPINIONATED, NO FLUFF
// ============================================================
const BUSINESS_SYSTEM_PROMPT = `You are the Business Strategist Agent of AION. Write clear, actionable PRDs engineers can build from. Separate MUST-HAVE from NICE-TO-HAVE ruthlessly. Challenge assumptions. Be honest about viability.

ROLE: Analyze ideas, write PRDs, define user stories with testable acceptance criteria, define MVP aggressively, generate READMEs, produce status reports, create deployment notifications, track features, assess risks.

PRD STRUCTURE (required): projectName, problemStatement (2-3 sentences), targetUsers (specific segment), coreFeatures [{name, description, userStories [{id, asA, iWant, soThat, acceptanceCriteria (2-4 specific/testable)}], priority}], mvpFeatures (minimum set, max 5), postMvpFeatures, technicalPreferences, successCriteria (measurable), summary.

RULES:
1. Only write about features user mentioned/implied
2. Mark suggestions as [SUGGESTION] with reason
3. Every feature needs 2+ specific, testable acceptance criteria
4. Separate MVP from post-MVP aggressively — if app works without it, it's not MVP
5. Follow PRD JSON structure exactly
6. Don't invent user needs
7. If vague, note what's unclear, make labeled assumptions
8. When revising PRD, only change what was asked
9. Max 5 features in MVP
10. Status reports use REAL data only
11. README accurate to actual tech stack
12. Deployment notifications only include ACTUALLY released features

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"actionType":"create_prd|revise_prd|generate_readme|status_report|deployment_notification|feature_tracking|risk_assessment|stakeholder_summary","analysis":"...","prd":{},"statusUpdate":"...","nextSteps":["..."],"readme":{"markdown":"...","sections":[]},"statusReport":{},"deploymentNotification":{},"featureTracking":{},"risks":[]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface BusinessOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    actionType?: BusinessActionType;
    analysis?: string;
    prd?: PRD;
    statusUpdate?: string;
    nextSteps?: string[];
    readme?: READMEContent;
    statusReport?: ProjectStatusReport;
    deploymentNotification?: DeploymentNotification;
    featureTracking?: FeatureTrackingResult;
    risks?: RiskEntry[];
  };
  confidence: number;
}

export class BusinessStrategistAgent extends BaseAgent {
  constructor() {
    super({
      role: 'business',
      name: 'Business Strategist',
      systemPrompt: BUSINESS_SYSTEM_PROMPT,
      writeAccess: ['prd', 'userStories', 'mvpScope', 'agentLog', 'readme', 'statusReports', 'deploymentNotifications'],
      deniedAccess: ['fileManifest', 'taskQueue', 'testResults', 'deployStatus'],
    });
  }

  /**
   * MAIN EXECUTE — Route to the correct business action
   * Determines action type from the task description and executes accordingly
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    // Detect what kind of business action this is
    const actionType = this.detectActionType(task);
    console.log(`[AION Business] Action detected: ${actionType}`);

    // Route to the appropriate handler
    switch (actionType) {
      case 'generate_readme':
        return this.generateReadme(task, context);
      case 'status_report':
        return this.generateStatusReport(task, context);
      case 'deployment_notification':
        return this.generateDeploymentNotification(task, context);
      case 'feature_tracking':
        return this.generateFeatureTracking(task, context);
      case 'risk_assessment':
        return this.generateRiskAssessment(task, context);
      case 'revise_prd':
        return this.revisePRDFromTask(task, context);
      case 'create_prd':
      default:
        return this.createPRDFromTask(task, context);
    }
  }

  // ============================================================
  // ACTION DETECTION — Figures out what kind of task this is
  // ============================================================

  private detectActionType(task: string): BusinessActionType {
    const lower = task.toLowerCase();

    if (lower.includes('readme') || lower.includes('documentation') && lower.includes('generate')) {
      return 'generate_readme';
    }
    if (lower.includes('status report') || lower.includes('project status') || lower.includes('how is the project')) {
      return 'status_report';
    }
    if (lower.includes('deployment notification') || lower.includes('went live') || lower.includes('announce') || lower.includes('launch announcement')) {
      return 'deployment_notification';
    }
    if (lower.includes('feature tracking') || lower.includes('feature completeness') || lower.includes('mvp progress') || lower.includes('track features')) {
      return 'feature_tracking';
    }
    if (lower.includes('risk assessment') || lower.includes('what are the risks') || lower.includes('risk report')) {
      return 'risk_assessment';
    }
    if (lower.includes('revise') || lower.includes('update prd') || lower.includes('change prd') || lower.includes('modify prd')) {
      return 'revise_prd';
    }

    // Default to creating PRD
    return 'create_prd';
  }

  // ============================================================
  // PRD CREATION (Original — Enhanced)
  // ============================================================

  private async createPRDFromTask(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    if (!result.data) {
      const extractedPrd = this.tryExtractPRDFromRaw(result.raw);
      if (extractedPrd) {
        return this.createResponse(
          'business-task',
          'success',
          {
            analysis: 'PRD extracted from response (AI formatting was non-standard but content was captured).',
            statusUpdate: `📋 PRD created for "${extractedPrd.projectName}" with ${extractedPrd.coreFeatures?.length || 0} core features and ${extractedPrd.mvpFeatures?.length || 0} MVP features.`,
            nextSteps: ['CTO reviews PRD', 'Create execution plan'],
          },
          0.6
        );
      }

      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'I had trouble structuring the PRD. The idea might need more detail, or I need to retry.',
          statusUpdate: '⚠️ Business Agent encountered a formatting issue. Please try again or provide more detail about your idea.',
        },
        0.3
      );
    }

    const data = result.data;
    const prd = data.output?.prd;

    // Validate the PRD quality
    const validation = this.validatePRD(prd);

    // Build a detailed status update
    let statusUpdate = data.output?.statusUpdate;
    if (!statusUpdate && prd) {
      statusUpdate = this.buildPRDStatusUpdate(prd, validation);
    }

    // Add validation warnings to analysis if any
    let analysis = data.output?.analysis;
    if (validation.warnings.length > 0) {
      analysis = (analysis || '') + '\n\n⚠️ PRD Quality Notes:\n' + validation.warnings.map(w => `- ${w}`).join('\n');
    }

    return this.createResponse(
      'business-task',
      data.status || (validation.isValid ? 'success' : 'needs_clarification'),
      {
        analysis,
        statusUpdate,
        nextSteps: data.output?.nextSteps || (validation.isValid
          ? ['CTO reviews PRD and creates execution plan', 'Begin building MVP features']
          : ['Refine PRD based on quality notes', 'Add more specific acceptance criteria']),
      },
      data.confidence || (validation.isValid ? 0.8 : 0.5)
    );
  }

  // ============================================================
  // PRD REVISION
  // ============================================================

  private async revisePRDFromTask(task: string, context: string): Promise<AgentResponse> {
    const userMessage = `CURRENT PROJECT STATE:\n${context}\n\nYOUR TASK:\n${task}\n\nINSTRUCTIONS:
- Only change what the feedback asks for — don't rewrite everything
- If the feedback asks to add features, consider if they should be MVP or post-MVP
- If the feedback asks to remove features, remove them and update user stories accordingly
- Keep all the parts that aren't being changed
- Make sure the revised PRD still follows all quality standards
- Update the summary if the scope has changed significantly`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'I had trouble revising the PRD. Please try again with more specific feedback.',
          statusUpdate: '⚠️ Could not revise PRD — AI formatting issue. Please retry.',
        },
        0.3
      );
    }

    const data = result.data;
    const prd = data.output?.prd;
    const validation = this.validatePRD(prd);

    return this.createResponse(
      'business-task',
      validation.isValid ? 'success' : 'needs_clarification',
      {
        analysis: data.output?.analysis,
        statusUpdate: data.output?.statusUpdate || `📋 PRD revised. ${validation.warnings.length} quality note(s).`,
        nextSteps: data.output?.nextSteps || ['CTO reviews revised PRD'],
      },
      data.confidence || (validation.isValid ? 0.8 : 0.5)
    );
  }

  // ============================================================
  // README GENERATION — Creates a real README.md for the project
  // ============================================================

  private async generateReadme(task: string, context: string): Promise<AgentResponse> {
    // First, collect real project data
    const projectId = this.extractProjectId(context);
    let projectData: any = null;

    if (projectId) {
      projectData = await this.collectProjectData(projectId);
    }

    // Build enhanced context with real project data
    const enhancedContext = this.buildReadmeContext(context, projectData);

    const userMessage = `PROJECT DATA FOR README GENERATION:\n${enhancedContext}\n\nYOUR TASK:\n${task}\n\nGenerate a comprehensive, professional README.md for this project. Use REAL data from the project — actual features from the PRD, real tech stack, actual file structure. Make it something a developer would be proud to show. Include:\n1. Project name and description\n2. The problem it solves\n3. Key features (from PRD)\n4. Tech stack\n5. Getting Started (prerequisites, installation, running locally)\n6. Environment variables needed\n7. API endpoints (if any)\n8. Deployment instructions\n9. Project structure\n\nRespond with JSON containing a "readme" object with "markdown" and "sections" fields.`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    if (!result.data?.output?.readme) {
      // AI didn't return structured readme — generate one from real data
      const fallbackReadme = this.generateFallbackReadme(projectData);
      return this.createResponse(
        'business-task',
        'success',
        {
          analysis: 'README generated from real project data (AI formatting fallback).',
          files: [{
            path: 'README.md',
            content: fallbackReadme.markdown,
            action: 'create',
            description: 'Project README — auto-generated from PRD and project data',
          }],
          statusUpdate: `📝 README.md generated with ${fallbackReadme.sections.length} sections based on real project data.`,
          nextSteps: ['Review README for accuracy', 'Add any project-specific details'],
        },
        0.7
      );
    }

    const readme = result.data.output.readme;

    return this.createResponse(
      'business-task',
      'success',
      {
        analysis: result.data.output.analysis,
        files: [{
          path: 'README.md',
          content: readme.markdown,
          action: 'create',
          description: 'Project README — generated by Business Strategist',
        }],
        statusUpdate: result.data.output.statusUpdate || `📝 README.md generated with ${readme.sections?.length || 0} sections.`,
        nextSteps: result.data.output.nextSteps || ['Review README for accuracy', 'Push to GitHub'],
      },
      result.data.confidence || 0.8
    );
  }

  // ============================================================
  // STATUS REPORT — Produces a real project status report
  // ============================================================

  private async generateStatusReport(task: string, context: string): Promise<AgentResponse> {
    const projectId = this.extractProjectId(context);

    if (!projectId) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'Cannot generate status report without a project context.',
          statusUpdate: '⚠️ No project context available for status report.',
        },
        0.3
      );
    }

    // Collect REAL project data from the database
    const projectData = await this.collectProjectData(projectId);
    const featureTracking = this.computeFeatureTracking(projectData);
    const metrics = this.computeMetrics(projectData);
    const risks = this.computeRisks(projectData, featureTracking);

    // Determine overall health
    const health = this.assessProjectHealth(metrics, featureTracking, risks);

    const statusReport: ProjectStatusReport = {
      projectName: projectData?.project?.name || 'Unknown',
      status: projectData?.project?.status || 'planning',
      summary: this.buildStatusSummary(projectData, featureTracking, health),
      featureTracking,
      metrics,
      risks,
      recentAccomplishments: this.getRecentAccomplishments(projectData),
      nextSteps: this.computeNextSteps(projectData, featureTracking),
      health,
      generatedAt: new Date().toISOString(),
    };

    // Also send to AI for narrative enrichment
    const userMessage = `REAL PROJECT DATA:\n${JSON.stringify(statusReport, null, 2)}\n\nYOUR TASK:\nWrite a compelling, honest status report narrative. Use the REAL metrics provided — do NOT make up numbers. Add your professional assessment of where this project stands. Be specific about risks and next steps.\n\nRespond with JSON containing a "statusReport" field and a "statusUpdate" summary.`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    // Merge AI narrative with real data
    const aiReport = result.data?.output?.statusReport;
    const finalReport: ProjectStatusReport = {
      ...statusReport,
      summary: aiReport?.summary || statusReport.summary,
    };

    const healthEmoji = health === 'healthy' ? '✅' : health === 'warning' ? '⚠️' : '🔴';
    const statusUpdate = result.data?.output?.statusUpdate ||
      `${healthEmoji} Status Report: ${projectData?.project?.name} is ${health.toUpperCase()} — ${featureTracking.mvpCompletionPercent}% MVP complete, ${metrics.openBugs} bugs open, ${metrics.completedTasks}/${metrics.totalTasks} tasks done.`;

    return this.createResponse(
      'business-task',
      'success',
      {
        analysis: result.data?.output?.analysis || statusReport.summary,
        statusUpdate,
        nextSteps: statusReport.nextSteps,
      },
      result.data?.confidence || 0.8
    );
  }

  // ============================================================
  // DEPLOYMENT NOTIFICATION — Creates launch announcements
  // ============================================================

  private async generateDeploymentNotification(task: string, context: string): Promise<AgentResponse> {
    const projectId = this.extractProjectId(context);

    if (!projectId) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'Cannot generate deployment notification without project context.',
          statusUpdate: '⚠️ No project context for deployment notification.',
        },
        0.3
      );
    }

    const projectData = await this.collectProjectData(projectId);
    const prd = projectData?.prd as PRD | null;
    const liveUrl = projectData?.project?.liveUrl;

    if (!liveUrl) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'Project is not deployed yet — cannot generate deployment notification without a live URL.',
          statusUpdate: '⚠️ No live URL found. Deploy first, then generate the notification.',
        },
        0.4
      );
    }

    const notification: DeploymentNotification = {
      projectName: prd?.projectName || projectData?.project?.name || 'Unknown',
      liveUrl,
      platform: 'render',
      deployedAt: new Date().toISOString(),
      mvpFeaturesIncluded: prd?.mvpFeatures || [],
      knownLimitations: prd?.postMvpFeatures?.slice(0, 5) || [],
      stakeholderSummary: this.buildStakeholderSummary(prd, liveUrl),
      nextMilestone: prd?.postMvpFeatures?.length
        ? `Post-MVP features: ${prd.postMvpFeatures.slice(0, 3).join(', ')}`
        : 'Gather user feedback and iterate',
    };

    // Send to AI for polished announcement
    const userMessage = `DEPLOYMENT DATA:\n${JSON.stringify(notification, null, 2)}\n\nYOUR TASK:\nWrite an exciting, professional deployment announcement for this project. It's LIVE! Include the URL, what features are included, and what's coming next. Make stakeholders excited. Be honest about what's included and what's not.\n\nRespond with JSON containing a "deploymentNotification" field and a "statusUpdate" summary.`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    const aiNotification = result.data?.output?.deploymentNotification;
    const finalNotification: DeploymentNotification = {
      ...notification,
      stakeholderSummary: aiNotification?.stakeholderSummary || notification.stakeholderSummary,
    };

    const statusUpdate = result.data?.output?.statusUpdate ||
      `🎉 ${finalNotification.projectName} is LIVE at ${finalNotification.liveUrl} — ${finalNotification.mvpFeaturesIncluded.length} MVP features shipped!`;

    return this.createResponse(
      'business-task',
      'success',
      {
        analysis: result.data?.output?.analysis || finalNotification.stakeholderSummary,
        statusUpdate,
        nextSteps: [
          'Test all features on the live URL',
          'Share the deployment announcement with stakeholders',
          'Monitor for issues in the first 24 hours',
          'Plan post-MVP features based on user feedback',
        ],
      },
      result.data?.confidence || 0.9
    );
  }

  // ============================================================
  // FEATURE TRACKING — Real PRD vs. actual progress analysis
  // ============================================================

  private async generateFeatureTracking(task: string, context: string): Promise<AgentResponse> {
    const projectId = this.extractProjectId(context);

    if (!projectId) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'Cannot track features without project context.',
          statusUpdate: '⚠️ No project context for feature tracking.',
        },
        0.3
      );
    }

    const projectData = await this.collectProjectData(projectId);
    const tracking = this.computeFeatureTracking(projectData);

    const readinessEmoji = tracking.mvpReadiness === 'complete' ? '✅' :
      tracking.mvpReadiness === 'on_track' ? '🟢' :
      tracking.mvpReadiness === 'at_risk' ? '🟡' : '🔴';

    const statusUpdate = `${readinessEmoji} MVP Progress: ${tracking.mvpCompletionPercent}% complete (${tracking.mvpFeaturesComplete}/${tracking.mvpFeaturesComplete + tracking.mvpFeaturesRemaining} features). Readiness: ${tracking.mvpReadiness.toUpperCase()}. ${tracking.blockers.length > 0 ? `Blocked by: ${tracking.blockers.join(', ')}` : 'No blockers.'}`;

    return this.createResponse(
      'business-task',
      'success',
      {
        analysis: `Feature tracking analysis: ${tracking.totalFeatures} total features, ${tracking.mvpFeaturesComplete} MVP features complete, ${tracking.mvpFeaturesRemaining} remaining. ${tracking.blockers.length} blocker(s) identified.`,
        statusUpdate,
        nextSteps: tracking.blockers.length > 0
          ? [`Resolve blockers: ${tracking.blockers.join(', ')}`, 'Re-assess MVP scope if blockers persist']
          : ['Continue building remaining MVP features', 'Run QA when MVP is feature-complete'],
      },
      0.85
    );
  }

  // ============================================================
  // RISK ASSESSMENT — Identifies and evaluates project risks
  // ============================================================

  private async generateRiskAssessment(task: string, context: string): Promise<AgentResponse> {
    const projectId = this.extractProjectId(context);

    if (!projectId) {
      return this.createResponse(
        'business-task',
        'needs_clarification',
        {
          analysis: 'Cannot assess risks without project context.',
          statusUpdate: '⚠️ No project context for risk assessment.',
        },
        0.3
      );
    }

    const projectData = await this.collectProjectData(projectId);
    const featureTracking = this.computeFeatureTracking(projectData);
    const metrics = this.computeMetrics(projectData);
    const risks = this.computeRisks(projectData, featureTracking);

    // Send to AI for professional risk narrative
    const userMessage = `PROJECT RISK DATA:\n${JSON.stringify({ metrics, featureTracking, risks }, null, 2)}\n\nYOUR TASK:\nAnalyze these project risks and provide a professional risk assessment. Add any risks you see from the data that might not be captured. For each risk, provide a mitigation strategy. Be honest and specific.\n\nRespond with JSON containing a "risks" array and a "statusUpdate" summary.`;

    const result = await this.callAgentAI<BusinessOutput>(userMessage);

    const finalRisks = [...risks];
    if (result.data?.output?.risks) {
      // Merge AI-identified risks with computed risks
      const aiRiskDescriptions = new Set(finalRisks.map(r => r.description));
      for (const aiRisk of result.data.output.risks) {
        if (!aiRiskDescriptions.has(aiRisk.description)) {
          finalRisks.push(aiRisk);
        }
      }
    }

    const criticalRisks = finalRisks.filter(r => r.severity === 'critical');
    const highRisks = finalRisks.filter(r => r.severity === 'high');
    const riskEmoji = criticalRisks.length > 0 ? '🔴' : highRisks.length > 0 ? '⚠️' : '✅';

    const statusUpdate = result.data?.output?.statusUpdate ||
      `${riskEmoji} Risk Assessment: ${finalRisks.length} risks identified — ${criticalRisks.length} critical, ${highRisks.length} high, ${finalRisks.length - criticalRisks.length - highRisks.length} medium/low.`;

    return this.createResponse(
      'business-task',
      'success',
      {
        analysis: result.data?.output?.analysis || `Identified ${finalRisks.length} risks across ${new Set(finalRisks.map(r => r.category)).size} categories.`,
        statusUpdate,
        nextSteps: criticalRisks.length > 0
          ? [`URGENT: Address critical risks: ${criticalRisks.map(r => r.description).join(', ')}`, 'Escalate to CTO if needed']
          : ['Monitor high risks', 'Implement mitigations', 'Re-assess after next milestone'],
      },
      result.data?.confidence || 0.8
    );
  }

  // ============================================================
  // DATA COLLECTION — Gathers real data from the database
  // ============================================================

  private async collectProjectData(projectId: string): Promise<any> {
    try {
      const project = await db.project.findUnique({
        where: { id: projectId },
        include: {
          tasks: { orderBy: { createdAt: 'asc' } },
          files: { orderBy: { path: 'asc' } },
          bugs: { orderBy: { id: 'desc' } },
          testResults: { orderBy: { ranAt: 'desc' }, take: 10 },
          agentLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
          deployments: { orderBy: { id: 'desc' } },
        },
      });

      if (!project) return null;

      let prd: PRD | null = null;
      if (project.prd) {
        try {
          prd = JSON.parse(project.prd);
        } catch {}
      }

      return { project, prd };
    } catch (error: any) {
      console.error('[AION Business] Failed to collect project data:', error.message);
      return null;
    }
  }

  /**
   * Extract project ID from context string
   */
  private extractProjectId(context: string): string | null {
    const match = context.match(/PROJECT:\s*(\S+)/);
    return match ? match[1] : null;
  }

  // ============================================================
  // FEATURE TRACKING COMPUTATION — PRD vs. actual progress
  // ============================================================

  private computeFeatureTracking(projectData: any): FeatureTrackingResult {
    const result: FeatureTrackingResult = {
      totalFeatures: 0,
      mvpFeaturesComplete: 0,
      mvpFeaturesRemaining: 0,
      postMvpFeaturesComplete: 0,
      mvpCompletionPercent: 0,
      overallCompletionPercent: 0,
      featureStatuses: [],
      mvpReadiness: 'behind',
      blockers: [],
    };

    if (!projectData?.prd) return result;

    const prd = projectData.prd as PRD;
    const tasks = projectData.project?.tasks || [];
    const bugs = projectData.project?.bugs || [];

    const completedTaskDescs = new Set<string>(
      tasks
        .filter((t: any) => t.status === 'done')
        .map((t: any) => (t.description as string).toLowerCase())
    );

    const failedTaskDescs = new Set<string>(
      tasks
        .filter((t: any) => t.status === 'failed')
        .map((t: any) => (t.description as string).toLowerCase())
    );

    const openBugsByFeature: Record<string, number> = {};
    for (const bug of bugs.filter((b: any) => b.status === 'open')) {
      // Try to associate bugs with features
      const featureName = prd.coreFeatures?.find((f: Feature) =>
        bug.description?.toLowerCase().includes(f.name.toLowerCase())
      )?.name || 'other';
      openBugsByFeature[featureName] = (openBugsByFeature[featureName] || 0) + 1;
    }

    const featureStatuses: FeatureStatusEntry[] = [];
    let mvpComplete = 0;
    let mvpRemaining = 0;
    let postMvpComplete = 0;
    let totalComplete = 0;

    for (const feature of prd.coreFeatures || []) {
      const isMvp = prd.mvpFeatures?.includes(feature.name) || false;
      const featureNameLower = feature.name.toLowerCase();

      // Check if any completed task relates to this feature
      const hasRelatedCompleteTask = completedTaskDescs.has(featureNameLower) ||
        Array.from(completedTaskDescs).some(desc => desc.includes(featureNameLower));

      const hasRelatedFailedTask = failedTaskDescs.has(featureNameLower) ||
        Array.from(failedTaskDescs).some(desc => desc.includes(featureNameLower));

      // Count user stories completed (approximate based on task completion)
      const totalStories = feature.userStories?.length || 0;
      let storiesComplete = hasRelatedCompleteTask ? totalStories : 0;

      let status: FeatureStatusEntry['status'] = 'not_started';
      if (hasRelatedCompleteTask && storiesComplete === totalStories) {
        status = 'complete';
      } else if (hasRelatedCompleteTask || hasRelatedFailedTask) {
        status = hasRelatedFailedTask ? 'blocked' : 'in_progress';
        storiesComplete = Math.max(0, Math.floor(totalStories / 2));
      }

      const hasBugs = (openBugsByFeature[feature.name] || 0) > 0;

      featureStatuses.push({
        featureName: feature.name,
        isMvp,
        priority: feature.priority,
        status,
        hasBugs,
        userStoriesComplete: storiesComplete,
        userStoriesTotal: totalStories,
      });

      if (status === 'complete') {
        totalComplete++;
        if (isMvp) {
          mvpComplete++;
        } else {
          postMvpComplete++;
        }
      } else {
        if (isMvp) {
          mvpRemaining++;
          if (status === 'blocked') {
            result.blockers.push(`${feature.name} (blocked)`);
          }
        }
      }
    }

    const totalFeatures = prd.coreFeatures?.length || 0;
    const totalMvpFeatures = mvpComplete + mvpRemaining;
    const mvpCompletionPercent = totalMvpFeatures > 0
      ? Math.round((mvpComplete / totalMvpFeatures) * 100)
      : 0;
    const overallCompletionPercent = totalFeatures > 0
      ? Math.round((totalComplete / totalFeatures) * 100)
      : 0;

    // Determine MVP readiness
    let mvpReadiness: FeatureTrackingResult['mvpReadiness'] = 'behind';
    if (mvpRemaining === 0 && mvpComplete > 0) {
      mvpReadiness = 'complete';
    } else if (mvpCompletionPercent >= 75) {
      mvpReadiness = 'on_track';
    } else if (mvpCompletionPercent >= 40) {
      mvpReadiness = 'at_risk';
    }

    return {
      totalFeatures,
      mvpFeaturesComplete: mvpComplete,
      mvpFeaturesRemaining: mvpRemaining,
      postMvpFeaturesComplete: postMvpComplete,
      mvpCompletionPercent,
      overallCompletionPercent,
      featureStatuses,
      mvpReadiness,
      blockers: result.blockers,
    };
  }

  // ============================================================
  // METRICS COMPUTATION — Real numbers from the database
  // ============================================================

  private computeMetrics(projectData: any): ProjectMetrics {
    const tasks = projectData?.project?.tasks || [];
    const bugs = projectData?.project?.bugs || [];
    const files = projectData?.project?.files || [];
    const agentLogs = projectData?.project?.agentLogs || [];
    const project = projectData?.project;

    const completedTasks = tasks.filter((t: any) => t.status === 'done').length;
    const pendingTasks = tasks.filter((t: any) => t.status === 'pending').length;
    const failedTasks = tasks.filter((t: any) => t.status === 'failed').length;
    const openBugs = bugs.filter((b: any) => b.status === 'open').length;
    const criticalBugs = bugs.filter((b: any) => b.status === 'open' && b.severity === 'critical').length;

    // Calculate average confidence from agent logs
    const confidences = agentLogs
      .map((l: any) => l.confidence)
      .filter((c: any): c is number => typeof c === 'number');
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length
      : 0;

    // Days since creation
    const createdAt = project?.createdAt ? new Date(project.createdAt) : new Date();
    const daysSinceCreation = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      totalTasks: tasks.length,
      completedTasks,
      pendingTasks,
      failedTasks,
      openBugs,
      criticalBugs,
      totalFiles: files.length,
      totalAgentCycles: project?.totalCycles || 0,
      daysSinceCreation,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
    };
  }

  // ============================================================
  // RISK COMPUTATION — Identifies risks from project data
  // ============================================================

  private computeRisks(projectData: any, featureTracking: FeatureTrackingResult): RiskEntry[] {
    const risks: RiskEntry[] = [];
    const metrics = this.computeMetrics(projectData);

    // Critical bugs are a quality risk
    if (metrics.criticalBugs > 0) {
      risks.push({
        description: `${metrics.criticalBugs} critical bug(s) unresolved — deployment is blocked`,
        severity: 'critical',
        category: 'quality',
        mitigation: 'Prioritize critical bug fixes immediately. Assign to the appropriate developer.',
      });
    }

    // Too many open bugs
    if (metrics.openBugs > 5) {
      risks.push({
        description: `${metrics.openBugs} open bugs — quality may be deteriorating`,
        severity: 'high',
        category: 'quality',
        mitigation: 'Schedule a bug-fix sprint before adding new features.',
      });
    }

    // High failed task count
    if (metrics.failedTasks > 2) {
      risks.push({
        description: `${metrics.failedTasks} task(s) have failed — some work is stuck`,
        severity: 'high',
        category: 'schedule',
        mitigation: 'Review failed tasks, identify root causes, and retry with clearer instructions.',
      });
    }

    // MVP behind schedule
    if (featureTracking.mvpReadiness === 'behind') {
      risks.push({
        description: `MVP is behind schedule — only ${featureTracking.mvpCompletionPercent}% complete`,
        severity: 'high',
        category: 'schedule',
        mitigation: 'Consider cutting MVP scope further or increasing agent automation cycles.',
      });
    }

    // Feature blockers
    if (featureTracking.blockers.length > 0) {
      risks.push({
        description: `${featureTracking.blockers.length} feature(s) blocked: ${featureTracking.blockers.join(', ')}`,
        severity: 'medium',
        category: 'technical',
        mitigation: 'Investigate blockers and assign fix tasks to the appropriate agents.',
      });
    }

    // Low confidence
    if (metrics.averageConfidence > 0 && metrics.averageConfidence < 0.5) {
      risks.push({
        description: `Low average agent confidence (${Math.round(metrics.averageConfidence * 100)}%) — agents may be struggling`,
        severity: 'medium',
        category: 'quality',
        mitigation: 'Review agent inputs and provide clearer task descriptions.',
      });
    }

    // Too many cycles without progress
    if (metrics.totalAgentCycles > 20 && metrics.pendingTasks > metrics.completedTasks) {
      risks.push({
        description: `High cycle count (${metrics.totalAgentCycles}) with more pending than completed tasks — possible loop`,
        severity: 'medium',
        category: 'resource',
        mitigation: 'Review the orchestration loop for stuck tasks or conflicting instructions.',
      });
    }

    // Scope creep risk
    const prd = projectData?.prd as PRD | null;
    if (prd && prd.coreFeatures && prd.coreFeatures.length > 8) {
      risks.push({
        description: `PRD has ${prd.coreFeatures.length} features — scope may be too large for MVP`,
        severity: 'low',
        category: 'scope',
        mitigation: 'Consider cutting non-essential features from MVP. Every feature adds risk.',
      });
    }

    return risks;
  }

  // ============================================================
  // HEALTH ASSESSMENT
  // ============================================================

  private assessProjectHealth(
    metrics: ProjectMetrics,
    featureTracking: FeatureTrackingResult,
    risks: RiskEntry[]
  ): 'healthy' | 'warning' | 'critical' {
    // Critical: critical bugs, or behind with blockers
    if (metrics.criticalBugs > 0) return 'critical';
    if (featureTracking.mvpReadiness === 'behind' && featureTracking.blockers.length > 0) return 'critical';
    if (risks.filter(r => r.severity === 'critical').length > 0) return 'critical';

    // Warning: many open bugs, at risk, high risks
    if (metrics.openBugs > 3) return 'warning';
    if (featureTracking.mvpReadiness === 'at_risk') return 'warning';
    if (risks.filter(r => r.severity === 'high').length > 1) return 'warning';
    if (metrics.failedTasks > 1) return 'warning';

    // Healthy: on track, no critical issues
    return 'healthy';
  }

  // ============================================================
  // HELPER: Build status summary
  // ============================================================

  private buildStatusSummary(
    projectData: any,
    featureTracking: FeatureTrackingResult,
    health: 'healthy' | 'warning' | 'critical'
  ): string {
    const projectName = projectData?.project?.name || 'Unknown';
    const status = projectData?.project?.status || 'unknown';
    const metrics = this.computeMetrics(projectData);

    return `${projectName} is currently ${status}. Health: ${health}. ` +
      `MVP progress: ${featureTracking.mvpCompletionPercent}% ` +
      `(${featureTracking.mvpFeaturesComplete} of ${featureTracking.mvpFeaturesComplete + featureTracking.mvpFeaturesRemaining} features). ` +
      `${metrics.completedTasks} tasks done, ${metrics.pendingTasks} pending, ${metrics.openBugs} bugs open. ` +
      `${featureTracking.blockers.length > 0 ? `Blocked by: ${featureTracking.blockers.join(', ')}.` : 'No blockers currently.'}`;
  }

  // ============================================================
  // HELPER: Get recent accomplishments
  // ============================================================

  private getRecentAccomplishments(projectData: any): string[] {
    const tasks = projectData?.project?.tasks || [];
    const completedTasks = tasks
      .filter((t: any) => t.status === 'done')
      .slice(-5)
      .map((t: any) => `[${t.assignedTo}] ${t.description}`);

    const resolvedBugs = projectData?.project?.bugs
      ?.filter((b: any) => b.status === 'resolved')
      ?.slice(-3)
      ?.map((b: any) => `Bug fixed: ${b.description}`) || [];

    return [...completedTasks, ...resolvedBugs];
  }

  // ============================================================
  // HELPER: Compute next steps
  // ============================================================

  private computeNextSteps(projectData: any, featureTracking: FeatureTrackingResult): string[] {
    const steps: string[] = [];
    const metrics = this.computeMetrics(projectData);

    if (metrics.criticalBugs > 0) {
      steps.push(`Fix ${metrics.criticalBugs} critical bug(s) before any other work`);
    }

    if (featureTracking.mvpFeaturesRemaining > 0) {
      steps.push(`Complete ${featureTracking.mvpFeaturesRemaining} remaining MVP feature(s)`);
    }

    if (metrics.pendingTasks > 0) {
      steps.push(`Execute ${metrics.pendingTasks} pending task(s)`);
    }

    if (featureTracking.mvpReadiness === 'complete') {
      steps.push('Run QA validation');
      steps.push('Deploy to production');
    }

    if (steps.length === 0) {
      steps.push('Review project scope and define next milestone');
    }

    return steps;
  }

  // ============================================================
  // HELPER: Build stakeholder summary for deployment notifications
  // ============================================================

  private buildStakeholderSummary(prd: PRD | null, liveUrl: string): string {
    if (!prd) {
      return `The project is now live at ${liveUrl}. Visit the URL to start using the application.`;
    }

    return `${prd.projectName} is now live! ${prd.summary || 'The application solves ' + prd.problemStatement + '.'} ` +
      `This release includes ${prd.mvpFeatures?.length || 0} core features: ${prd.mvpFeatures?.join(', ') || 'core functionality'}. ` +
      `Visit ${liveUrl} to try it now.`;
  }

  // ============================================================
  // HELPER: Build README context from real project data
  // ============================================================

  private buildReadmeContext(baseContext: string, projectData: any): string {
    const parts: string[] = [baseContext];

    if (!projectData) return baseContext;

    const prd = projectData.prd as PRD | null;
    const project = projectData.project;

    if (prd) {
      parts.push('\n========================================');
      parts.push('PRD DATA FOR README:');
      parts.push('========================================');
      parts.push(`Project Name: ${prd.projectName}`);
      parts.push(`Problem: ${prd.problemStatement}`);
      parts.push(`Target Users: ${prd.targetUsers}`);
      parts.push(`Summary: ${prd.summary}`);
      parts.push(`Tech Preferences: ${prd.technicalPreferences}`);
      parts.push(`MVP Features: ${prd.mvpFeatures?.join(', ')}`);
      parts.push(`Success Criteria: ${prd.successCriteria?.join('; ')}`);
    }

    if (project?.files?.length > 0) {
      parts.push('\n========================================');
      parts.push('FILE STRUCTURE (for README project structure section):');
      parts.push('========================================');
      const paths = project.files.map((f: any) => f.path).sort();
      paths.forEach((p: string) => parts.push(`  ${p}`));
    }

    if (project?.testResults?.length > 0) {
      parts.push('\n========================================');
      parts.push('TEST RESULTS:');
      parts.push('========================================');
      project.testResults.forEach((tr: any) => {
        parts.push(`  ${tr.testType}: ${tr.passed ? 'PASS' : 'FAIL'}`);
      });
    }

    return parts.join('\n');
  }

  // ============================================================
  // HELPER: Generate fallback README from real project data
  // ============================================================

  private generateFallbackReadme(projectData: any): READMEContent {
    const prd = projectData?.prd as PRD | null;
    const project = projectData?.project;
    const projectName = prd?.projectName || project?.name || 'AION Project';
    const sections: string[] = [];

    let markdown = `# ${projectName}\n\n`;

    // Description
    if (prd?.summary) {
      markdown += `${prd.summary}\n\n`;
      sections.push('Description');
    } else if (prd?.problemStatement) {
      markdown += `${prd.problemStatement}\n\n`;
      sections.push('Description');
    }

    // Problem
    if (prd?.problemStatement) {
      markdown += `## Problem\n\n${prd.problemStatement}\n\n`;
      sections.push('Problem');
    }

    // Features
    if (prd?.mvpFeatures && prd.mvpFeatures.length > 0) {
      markdown += `## Features\n\n`;
      for (const feature of prd.mvpFeatures) {
        markdown += `- ${feature}\n`;
      }
      markdown += '\n';
      sections.push('Features');
    }

    // Tech Stack
    markdown += `## Tech Stack\n\n`;
    markdown += `- **Framework**: Next.js (App Router)\n`;
    markdown += `- **Language**: TypeScript\n`;
    markdown += `- **Styling**: Tailwind CSS\n`;
    markdown += `- **Database**: SQLite (Prisma ORM)\n`;
    markdown += `- **Deployment**: Render\n\n`;
    sections.push('Tech Stack');

    // Getting Started
    markdown += `## Getting Started\n\n`;
    markdown += `### Prerequisites\n\n`;
    markdown += `- Node.js 18+\n`;
    markdown += `- npm or yarn\n\n`;
    markdown += `### Installation\n\n`;
    markdown += `\`\`\`bash\n`;
    markdown += `git clone <repository-url>\n`;
    markdown += `cd ${projectName.toLowerCase().replace(/\s+/g, '-')}\n`;
    markdown += `npm install\n`;
    markdown += `\`\`\`\n\n`;
    markdown += `### Running Locally\n\n`;
    markdown += `\`\`\`bash\n`;
    markdown += `npm run dev\n`;
    markdown += `\`\`\`\n\n`;
    markdown += `Open [http://localhost:3000](http://localhost:3000) in your browser.\n\n`;
    sections.push('Getting Started');

    // Environment Variables
    markdown += `## Environment Variables\n\n`;
    markdown += `Create a \`.env.local\` file in the root directory:\n\n`;
    markdown += `\`\`\`env\n`;
    markdown += `DATABASE_URL="file:./dev.db"\n`;
    markdown += `\`\`\`\n\n`;
    sections.push('Environment Variables');

    // Project Structure
    if (project?.files?.length > 0) {
      markdown += `## Project Structure\n\n`;
      markdown += `\`\`\`\n`;
      const paths = project.files.map((f: any) => f.path).sort();
      paths.forEach((p: string) => {
        markdown += `${p}\n`;
      });
      markdown += `\`\`\`\n\n`;
      sections.push('Project Structure');
    }

    // Deployment
    markdown += `## Deployment\n\n`;
    markdown += `This project is configured for deployment on [Render](https://render.com).\n\n`;
    markdown += `The \`render.yaml\` file in the root directory configures the deployment automatically.\n\n`;
    sections.push('Deployment');

    // Target Users
    if (prd?.targetUsers) {
      markdown += `## Target Users\n\n${prd.targetUsers}\n\n`;
      sections.push('Target Users');
    }

    // Success Criteria
    if (prd?.successCriteria && prd.successCriteria.length > 0) {
      markdown += `## Success Criteria\n\n`;
      for (const criteria of prd.successCriteria) {
        markdown += `- ${criteria}\n`;
      }
      markdown += '\n';
      sections.push('Success Criteria');
    }

    markdown += `---\n*Built with [AION](https://github.com/aion) — Autonomous Intelligent Orchestration Network*\n`;

    return { markdown, sections };
  }

  // ============================================================
  // PRD VALIDATION (Original — preserved)
  // ============================================================

  private validatePRD(prd: PRD | undefined): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (!prd) {
      return { isValid: false, warnings: ['No PRD was generated'] };
    }

    // Check required fields
    if (!prd.projectName) warnings.push('Missing project name');
    if (!prd.problemStatement) warnings.push('Missing problem statement');
    if (!prd.targetUsers) warnings.push('Missing target users — should be specific, not generic');
    if (!prd.summary) warnings.push('Missing summary — need a 1-2 sentence elevator pitch');

    // Check core features
    if (!prd.coreFeatures || prd.coreFeatures.length === 0) {
      warnings.push('No core features defined — PRD needs at least 1 feature');
    } else {
      for (const feature of prd.coreFeatures) {
        if (!feature.name) warnings.push(`Feature missing name`);
        if (!feature.description) warnings.push(`Feature "${feature.name}" missing description`);

        if (!feature.userStories || feature.userStories.length === 0) {
          warnings.push(`Feature "${feature.name}" has no user stories`);
        } else {
          for (const story of feature.userStories) {
            if (!story.asA || !story.iWant || !story.soThat) {
              warnings.push(`User story "${story.id}" is incomplete — needs asA, iWant, soThat`);
            }
            if (!story.acceptanceCriteria || story.acceptanceCriteria.length < 2) {
              warnings.push(`User story "${story.id}" needs at least 2 specific acceptance criteria`);
            }
          }
        }

        if (!['critical', 'high', 'medium', 'low'].includes(feature.priority)) {
          warnings.push(`Feature "${feature.name}" has invalid priority: ${feature.priority}`);
        }
      }
    }

    // Check MVP features
    if (!prd.mvpFeatures || prd.mvpFeatures.length === 0) {
      warnings.push('No MVP features defined — need to specify which features are essential');
    } else if (prd.mvpFeatures.length > 5) {
      warnings.push(`MVP has ${prd.mvpFeatures.length} features — consider cutting to 5 or fewer for a faster launch`);
    }

    // Check success criteria
    if (!prd.successCriteria || prd.successCriteria.length === 0) {
      warnings.push('No success criteria defined — need measurable metrics');
    }

    // Check for vague language
    const vaguePhrases = ['intuitive', 'user-friendly', 'easy to use', 'seamless', 'good ux', 'works well', 'nice'];
    const allText = JSON.stringify(prd).toLowerCase();
    const foundVague = vaguePhrases.filter(phrase => allText.includes(phrase));
    if (foundVague.length > 0) {
      warnings.push(`PRD contains vague language: "${foundVague.join('", "')}". Replace with specific, testable criteria.`);
    }

    const criticalWarnings = warnings.filter(w =>
      w.includes('No PRD') ||
      w.includes('No core features') ||
      w.includes('No MVP features') ||
      w.includes('Missing problem statement')
    );

    return {
      isValid: criticalWarnings.length === 0,
      warnings,
    };
  }

  /**
   * Build a detailed status update from a PRD
   */
  private buildPRDStatusUpdate(prd: PRD, validation: { isValid: boolean; warnings: string[] }): string {
    const parts: string[] = [];

    parts.push(`📋 PRD created for "${prd.projectName}"`);

    if (prd.problemStatement) {
      parts.push(`Problem: ${prd.problemStatement.substring(0, 100)}${prd.problemStatement.length > 100 ? '...' : ''}`);
    }

    parts.push(`Core Features: ${prd.coreFeatures?.length || 0}`);
    parts.push(`MVP Features: ${prd.mvpFeatures?.length || 0} | Post-MVP: ${prd.postMvpFeatures?.length || 0}`);

    const totalStories = prd.coreFeatures?.reduce((sum, f) => sum + (f.userStories?.length || 0), 0) || 0;
    parts.push(`User Stories: ${totalStories}`);

    if (validation.isValid) {
      parts.push('✅ PRD quality check passed');
    } else {
      parts.push(`⚠️ PRD has ${validation.warnings.length} quality note(s)`);
    }

    if (prd.mvpFeatures && prd.mvpFeatures.length > 5) {
      parts.push(`💡 Consider cutting MVP to 5 features or fewer (currently ${prd.mvpFeatures.length})`);
    }

    return parts.join('\n');
  }

  /**
   * Try to extract a PRD from raw AI text when JSON parsing fails
   */
  private tryExtractPRDFromRaw(raw: string): PRD | null {
    if (!raw || raw.length < 50) return null;

    const jsonMatch = raw.match(/\{[\s\S]*"projectName"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.projectName) {
          return {
            projectName: parsed.projectName,
            problemStatement: parsed.problemStatement || 'Not specified',
            targetUsers: parsed.targetUsers || 'Not specified',
            coreFeatures: parsed.coreFeatures || [],
            mvpFeatures: parsed.mvpFeatures || [],
            postMvpFeatures: parsed.postMvpFeatures || [],
            technicalPreferences: parsed.technicalPreferences || 'Next.js, TypeScript, Tailwind CSS',
            successCriteria: parsed.successCriteria || ['Application builds and runs'],
            summary: parsed.summary || `${parsed.projectName} — ${parsed.problemStatement?.substring(0, 80) || 'A new application'}`,
          };
        }
      } catch {}
    }

    const nestedMatch = raw.match(/"prd"\s*:\s*(\{[\s\S]*?"summary"[\s\S]*?\})/);
    if (nestedMatch) {
      try {
        const parsed = JSON.parse(nestedMatch[1]);
        if (parsed.projectName) {
          return parsed as PRD;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Convenience method: Create a PRD from a user's idea
   */
  async createPRD(userIdea: string, projectState: string): Promise<AgentResponse> {
    const task = `Create a comprehensive PRD for this idea: "${userIdea}"

Remember:
- Be HONEST about viability. Is this a good idea? What are the risks?
- Every feature needs CLEAR, SPECIFIC acceptance criteria — not vague ones
- Separate MVP from post-MVP AGGRESSIVELY — cut everything that isn't essential
- Mark suggested features as [SUGGESTION] with a clear reason WHY
- Be specific about target users — not "everyone" but a specific segment
- Include measurable success criteria
- MVP should have NO MORE than 5 features — if you have more, cut harder`;

    return this.createPRDFromTask(task, projectState);
  }

  /**
   * Convenience method: Revise an existing PRD
   */
  async revisePRD(existingPRD: PRD, feedback: string, projectState: string): Promise<AgentResponse> {
    const task = `REVISE the existing PRD based on this feedback: "${feedback}"

EXISTING PRD:
${JSON.stringify(existingPRD, null, 2)}

INSTRUCTIONS:
- Only change what the feedback asks for — don't rewrite everything
- If the feedback asks to add features, consider if they should be MVP or post-MVP
- If the feedback asks to remove features, remove them and update user stories accordingly
- Keep all the parts that aren't being changed
- Make sure the revised PRD still follows all quality standards
- Update the summary if the scope has changed significantly`;

    return this.revisePRDFromTask(task, projectState);
  }

  /**
   * Convenience method: Generate a project README
   */
  async generateProjectReadme(projectState: string): Promise<AgentResponse> {
    return this.generateReadme(
      'Generate a comprehensive, professional README.md for this project based on the PRD, tech stack, and file structure.',
      projectState
    );
  }

  /**
   * Convenience method: Get a project status report
   */
  async getProjectStatusReport(projectState: string): Promise<AgentResponse> {
    return this.generateStatusReport(
      'Generate a detailed project status report with real metrics, feature tracking, risk assessment, and next steps.',
      projectState
    );
  }

  /**
   * Convenience method: Generate a deployment notification
   */
  async getDeploymentNotification(projectState: string): Promise<AgentResponse> {
    return this.generateDeploymentNotification(
      'Generate an exciting, professional deployment announcement for this project. It just went live!',
      projectState
    );
  }
}
