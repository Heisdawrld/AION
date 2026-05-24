// AION — DevOps Lead Agent (Enhanced)
// Build, deploy, ship specialist. Opinionated about infrastructure.
// Now with REAL execution: builds, git operations, URL testing, deployment configs.
// "It works on my machine" means NOTHING. If it's not deployed and verified, it doesn't exist.

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
  DevOpsChecklist,
  DeploymentResult,
  UrlTestResult,
} from '@/lib/types/aion';
import { commandRunner } from '@/lib/engine/command-runner';
import { workspaceManager } from '@/lib/engine/workspace-manager';

// ============================================================
// THE DEVOPS LEAD — OBSESSED WITH SHIPPING, PARANOID ABOUT VERIFICATION
// ============================================================
const DEVOPS_SYSTEM_PROMPT = `You are the DevOps Lead Agent of AION.

You are a senior DevOps engineer with 12+ years of experience shipping code to production. You've deployed everything from simple static sites to distributed microservices across AWS, GCP, and Azure. You've been paged at 3am enough times to know that "it works on my machine" is the most dangerous phrase in engineering. You've built CI/CD pipelines from scratch, debugged production outages, and survived Kubernetes migrations. You know that code that's not deployed is code that doesn't exist.

YOUR PERSONALITY:
- You are OBSESSED with shipping. Code that's not deployed is dead code. A feature that's not live is a feature that doesn't exist.
- You are PARANOID about verification. "Deployed" means "URL returns 200 with expected content." Nothing less counts.
- You are PRAGMATIC about infrastructure. Render free tier is fine for MVP. Kubernetes is overkill for a prototype. Keep it simple, keep it fast, keep it working.
- You are OPINIONATED about deployment configs. Simple, standard, well-documented. If a config file needs a 10-page README, it's wrong.
- You think about ROLLBACK. Every deployment should be reversible. Every config change should be version-controlled.
- You HATE manual steps. If something can be automated, it should be. If it can't be automated, it should be documented so precisely that it's basically automated.
- You RESPECT the QA gate. QA says no deploy = no deploy. No exceptions. No shortcuts. No "just this once."

YOUR ROLE:
- Build the project and verify the build succeeds
- Initialize git repository and commit code
- Create deployment configuration (render.yaml, .gitignore, etc.)
- Test live URLs after deployment
- Verify deployment readiness at every step
- Handle build/deploy failures with actionable feedback

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. BUILD: The system runs "npm run build" in the workspace. You get the real output.
2. GIT: The system runs git init, add, commit. You get real results.
3. DEPLOYMENT READINESS: The system checks workspace, deps, git, and deployment configs.
4. URL TESTING: The system can test live URLs and verify HTTP 200 + content.
5. FILE WRITING: The system writes deployment config files to the workspace.

DEPLOYMENT PIPELINE (follow this order):
1. VERIFY workspace: Does package.json exist? Are deps installed?
2. INSTALL dependencies: Run npm install if needed
3. BUILD project: Run npm run build. If it fails, STOP and report errors.
4. GIT INIT: Initialize git repo if not already done
5. GIT COMMIT: Stage and commit all files
6. CREATE deployment configs: render.yaml, .gitignore, health check endpoint
7. DEPLOYMENT READINESS CHECK: Verify everything is ready
8. (If URL available) TEST URL: Verify live URL returns 200

DEPLOYMENT STANDARDS:
- Use Render (render.yaml) for deployment — free tier, Node.js runtime
- Build command: npm run build
- Start command: npm run start
- Include health check endpoint at /api/health
- Use environment groups for secrets
- Set NODE_ENV=production
- Generate a proper .gitignore (node_modules, .next, .env, etc.)
- If using Prisma, include postinstall script for generate
- Use cuid IDs in all configs

RENDER.YAML TEMPLATE (use this as baseline):
services:
  - type: web
    name: [project-name]
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    plan: free
    envVars:
      - key: NODE_ENV
        value: production

.GITIGNORE TEMPLATE (always include):
node_modules/
.next/
.env
.env.local
.env.production
*.log
.DS_Store

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write configuration and deployment files (render.yaml, .gitignore, Dockerfile, etc.)
2. You NEVER modify application code — that's for Frontend/Backend agents
3. You CANNOT claim deployment is live without HTTP 200 verification
4. You CANNOT claim GitHub push succeeded without confirmation
5. You MUST include exact error messages from build/deploy failures
6. You MUST test the URL after every deployment
7. You MUST specify ALL environment variables needed for deployment
8. You MUST respect the QA gate — if QA hasn't approved, you DON'T deploy
9. You MUST verify build success BEFORE attempting deployment
10. You MUST create .gitignore before committing (to avoid committing secrets or node_modules)

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Deployment status — what's ready, what's blocking, what was verified",
    "files": [{ "path": "render.yaml", "content": "...", "action": "create", "description": "..." }],
    "checklist": {
      "projectInitialized": true/false,
      "dependenciesInstalled": true/false,
      "buildSucceeds": true/false,
      "gitInitialized": true/false,
      "gitCommitted": true/false,
      "readyForGithub": true/false,
      "deploymentConfigured": true/false,
      "readyForDeploy": true/false,
      "urlReturns200": true/false,
      "urlContainsExpectedContent": true/false
    },
    "deploymentResult": {
      "success": true/false,
      "platform": "render",
      "buildVerified": true/false,
      "gitReady": true/false,
      "urlTested": true/false,
      "deploymentUrl": "url or null",
      "errors": [],
      "warnings": [],
      "summary": "What happened, what's next"
    },
    "statusUpdate": "Your message to the CTO and user — be specific about deployment status",
    "nextSteps": ["Specific actions to take"]
  },
  "confidence": 0.0-1.0
}`;

// ============================================================
// INTERFACES
// ============================================================

interface DevOpsOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    checklist?: DevOpsChecklist;
    deploymentResult?: {
      success: boolean;
      platform: string;
      buildVerified: boolean;
      gitReady: boolean;
      urlTested: boolean;
      deploymentUrl?: string;
      errors: string[];
      warnings: string[];
      summary: string;
    };
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class DevOpsLeadAgent extends BaseAgent {
  constructor() {
    super({
      role: 'devops',
      name: 'DevOps Lead',
      systemPrompt: DEVOPS_SYSTEM_PROMPT,
      writeAccess: ['buildStatus', 'deployStatus', 'githubStatus', 'liveUrl', 'urlTestResult', 'agentLog'],
      deniedAccess: ['fileManifest'],
    });
  }

  /**
   * MAIN EXECUTE — Full deployment pipeline with real execution
   * This actually builds, commits, and prepares for deployment
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    // Extract projectId from context
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 1: Run real deployment readiness checks
    // ========================================
    let checklist: DevOpsChecklist | null = null;
    if (projectId) {
      checklist = commandRunner.checkDeploymentReadiness(projectId);
    }

    // ========================================
    // STEP 2: Execute real build if needed
    // ========================================
    let buildResult: { success: boolean; stdout: string; stderr: string; duration: number } | null = null;
    if (projectId) {
      // Install deps first if needed
      if (checklist && !checklist.dependenciesInstalled) {
        console.log('[AION DevOps] Installing dependencies...');
        const installResult = commandRunner.installDeps(projectId);
        if (installResult.success) {
          checklist.dependenciesInstalled = true;
        }
      }

      // Run the build
      console.log('[AION DevOps] Running production build...');
      const rawBuildResult = commandRunner.runBuild(projectId);
      buildResult = {
        success: rawBuildResult.success,
        stdout: rawBuildResult.stdout,
        stderr: rawBuildResult.stderr,
        duration: rawBuildResult.duration,
      };

      if (checklist) {
        checklist.buildSucceeds = rawBuildResult.success;
      }
    }

    // ========================================
    // STEP 3: Execute real git operations
    // ========================================
    let gitResult: { initOk: boolean; addOk: boolean; commitOk: boolean; commitMessage: string } = {
      initOk: false, addOk: false, commitOk: false, commitMessage: ''
    };
    if (projectId && buildResult?.success) {
      gitResult = await this.executeGitOperations(projectId);
      if (checklist) {
        checklist.gitInitialized = gitResult.initOk;
        checklist.gitCommitted = gitResult.commitOk;
        checklist.readyForGithub = gitResult.initOk && gitResult.commitOk;
      }
    }

    // ========================================
    // STEP 4: Test live URL if available
    // ========================================
    let urlTestResult: UrlTestResult | null = null;
    // We'll test the URL if it's in the context (from a previous deployment)
    const urlMatch = context.match(/LIVE URL:\s*(https?:\/\/\S+)/i) ||
                     context.match(/liveUrl:\s*(https?:\/\/\S+)/i);
    if (urlMatch && projectId) {
      const liveUrl = urlMatch[1];
      console.log(`[AION DevOps] Testing live URL: ${liveUrl}`);
      const testResult = await commandRunner.testUrl(liveUrl);
      urlTestResult = {
        url: liveUrl,
        statusCode: testResult.statusCode,
        responseTime: testResult.responseTime,
        containsExpectedContent: testResult.containsExpectedContent,
        timestamp: new Date().toISOString(),
      };
      if (checklist) {
        checklist.urlReturns200 = testResult.success;
        checklist.urlContainsExpectedContent = testResult.containsExpectedContent;
      }
    }

    // ========================================
    // STEP 5: Build enhanced context with real results
    // ========================================
    const enhancedContext = this.buildEnhancedContext(context, checklist, buildResult, gitResult, urlTestResult);

    // ========================================
    // STEP 6: Send to AI for deployment analysis + config generation
    // ========================================
    const userMessage = `CURRENT PROJECT STATE + REAL DEPLOYMENT RESULTS:\n${enhancedContext}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<DevOpsOutput>(userMessage);

    if (!result.data) {
      // Even if AI fails, we have real deployment results — return those
      return this.createBuildOnlyResponse(checklist, buildResult, gitResult, urlTestResult, projectId);
    }

    const data = result.data;

    // ========================================
    // STEP 7: Build the deployment result from real data + AI analysis
    // ========================================
    const deploymentResult = this.buildDeploymentResult(data, checklist, buildResult, gitResult, urlTestResult);

    const overallStatus = deploymentResult.success ? 'success' : 'failed';

    return this.createResponse(
      'devops-task',
      data.status === 'needs_clarification' ? 'needs_clarification' : overallStatus,
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate || this.generateStatusUpdate(deploymentResult, buildResult),
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  // ============================================================
  // REAL EXECUTION METHODS
  // ============================================================

  /**
   * Execute the full git workflow: init → add → commit
   * Creates .gitignore first to avoid committing junk
   */
  private async executeGitOperations(projectId: string): Promise<{
    initOk: boolean;
    addOk: boolean;
    commitOk: boolean;
    commitMessage: string;
  }> {
    const result = { initOk: false, addOk: false, commitOk: false, commitMessage: '' };

    // Create .gitignore if it doesn't exist
    try {
      const workspacePath = workspaceManager.getWorkspacePath(projectId);
      const fs = await import('fs/promises');
      const gitignorePath = `${workspacePath}/.gitignore`;

      try {
        await fs.access(gitignorePath);
        // .gitignore exists
      } catch {
        // Create .gitignore
        const gitignoreContent = `node_modules/
.next/
.env
.env.local
.env.production
*.log
.DS_Store
dist/
coverage/
.vercel/
.turbo/`;
        await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');
        console.log('[AION DevOps] Created .gitignore');
      }
    } catch (error: any) {
      console.error('[AION DevOps] Failed to create .gitignore:', error.message);
    }

    // Step 1: git init
    const initResult = commandRunner.gitInit(projectId);
    result.initOk = initResult.success;
    if (!initResult.success) {
      console.error('[AION DevOps] Git init failed:', initResult.error);
      return result;
    }

    // Step 2: git add
    const addResult = commandRunner.gitAdd(projectId);
    result.addOk = addResult.success;
    if (!addResult.success) {
      console.error('[AION DevOps] Git add failed:', addResult.error);
      return result;
    }

    // Step 3: git commit
    const commitResult = commandRunner.gitCommit(projectId, 'Deploy: initial commit via AION DevOps Agent');
    result.commitOk = commitResult.success;
    result.commitMessage = commitResult.message;

    if (!commitResult.success && commitResult.error?.includes('nothing to commit')) {
      // Nothing to commit is actually OK — means we're already committed
      result.commitOk = true;
      result.commitMessage = 'Already committed — no new changes';
    }

    return result;
  }

  /**
   * Build enhanced context that includes real deployment data
   */
  private buildEnhancedContext(
    baseContext: string,
    checklist: DevOpsChecklist | null,
    buildResult: { success: boolean; stdout: string; stderr: string; duration: number } | null,
    gitResult: { initOk: boolean; addOk: boolean; commitOk: boolean; commitMessage: string } | null,
    urlTestResult: UrlTestResult | null
  ): string {
    const parts: string[] = [baseContext];

    if (checklist) {
      parts.push('\n========================================');
      parts.push('DEPLOYMENT READINESS CHECKLIST (ACTUALLY VERIFIED):');
      parts.push('========================================');
      parts.push(`Project Initialized: ${checklist.projectInitialized ? '✅' : '❌'}`);
      parts.push(`Dependencies Installed: ${checklist.dependenciesInstalled ? '✅' : '❌'}`);
      parts.push(`Build Succeeds: ${checklist.buildSucceeds ? '✅' : '❌'}`);
      parts.push(`Git Initialized: ${checklist.gitInitialized ? '✅' : '❌'}`);
      parts.push(`Git Committed: ${checklist.gitCommitted ? '✅' : '❌'}`);
      parts.push(`Ready for GitHub: ${checklist.readyForGithub ? '✅' : '❌'}`);
      parts.push(`Deployment Configured: ${checklist.deploymentConfigured ? '✅' : '❌'}`);
      parts.push(`Ready for Deploy: ${checklist.readyForDeploy ? '✅' : '❌'}`);
    }

    if (buildResult) {
      parts.push('\n========================================');
      parts.push('BUILD RESULT (ACTUALLY EXECUTED):');
      parts.push('========================================');
      parts.push(`Build: ${buildResult.success ? '✅ PASSED' : '❌ FAILED'} (${buildResult.duration}ms)`);
      if (!buildResult.success) {
        const errorLines = buildResult.stderr.split('\n').slice(0, 30).join('\n');
        parts.push(`BUILD ERRORS:\n${errorLines}`);
      }
    }

    if (gitResult) {
      parts.push('\n========================================');
      parts.push('GIT OPERATIONS (ACTUALLY EXECUTED):');
      parts.push('========================================');
      parts.push(`Git Init: ${gitResult.initOk ? '✅' : '❌'}`);
      parts.push(`Git Add: ${gitResult.addOk ? '✅' : '❌'}`);
      parts.push(`Git Commit: ${gitResult.commitOk ? '✅' : '❌'} — ${gitResult.commitMessage}`);
    }

    if (urlTestResult) {
      parts.push('\n========================================');
      parts.push('URL TEST RESULT (ACTUALLY TESTED):');
      parts.push('========================================');
      parts.push(`URL: ${urlTestResult.url}`);
      parts.push(`Status: ${urlTestResult.statusCode} (${urlTestResult.statusCode === 200 ? '✅ OK' : '❌ NOT OK'})`);
      parts.push(`Response Time: ${urlTestResult.responseTime}ms`);
      parts.push(`Expected Content: ${urlTestResult.containsExpectedContent ? '✅ Found' : '❌ Not Found'}`);
    }

    return parts.join('\n');
  }

  /**
   * Build the DeploymentResult from AI analysis + real execution data
   */
  private buildDeploymentResult(
    data: DevOpsOutput,
    checklist: DevOpsChecklist | null,
    buildResult: { success: boolean; stdout: string; stderr: string; duration: number } | null,
    gitResult: { initOk: boolean; addOk: boolean; commitOk: boolean; commitMessage: string } | null,
    urlTestResult: UrlTestResult | null
  ): DeploymentResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (buildResult && !buildResult.success) {
      errors.push(`Build failed: ${buildResult.stderr.substring(0, 200)}`);
    }
    if (gitResult && !gitResult.initOk) {
      warnings.push('Git initialization failed — version control not available');
    }
    if (gitResult && !gitResult.commitOk) {
      warnings.push('Git commit failed — code not committed');
    }
    if (urlTestResult && urlTestResult.statusCode !== 200) {
      errors.push(`URL test failed: ${urlTestResult.statusCode} response from ${urlTestResult.url}`);
    }

    // Add AI-reported errors
    if (data.output?.deploymentResult?.errors) {
      errors.push(...data.output.deploymentResult.errors);
    }
    if (data.output?.deploymentResult?.warnings) {
      warnings.push(...data.output.deploymentResult.warnings);
    }

    const buildVerified = buildResult?.success ?? false;
    const gitReady = (gitResult?.initOk ?? false) && (gitResult?.commitOk ?? false);
    const urlTested = urlTestResult !== null;

    return {
      success: buildVerified && errors.length === 0,
      platform: 'render',
      buildVerified,
      gitReady,
      urlTested,
      urlTestResult: urlTestResult || undefined,
      deploymentUrl: data.output?.deploymentResult?.deploymentUrl,
      errors,
      warnings,
      checklist: checklist || data.output?.checklist || {
        projectInitialized: false,
        dependenciesInstalled: false,
        buildSucceeds: buildVerified,
        gitInitialized: gitResult?.initOk ?? false,
        gitCommitted: gitResult?.commitOk ?? false,
        readyForGithub: gitReady,
        deploymentConfigured: false,
        readyForDeploy: buildVerified && gitReady,
        urlReturns200: urlTestResult?.statusCode === 200,
        urlContainsExpectedContent: urlTestResult?.containsExpectedContent ?? false,
      },
      summary: data.output?.deploymentResult?.summary || this.buildSummary(buildVerified, gitReady, urlTested, errors, warnings),
    };
  }

  /**
   * Generate a status update message from real results
   */
  private generateStatusUpdate(
    deploymentResult: DeploymentResult,
    buildResult: { success: boolean; duration: number } | null
  ): string {
    const parts: string[] = [];

    if (buildResult) {
      parts.push(buildResult.success
        ? `✅ Build PASSED (${buildResult.duration}ms)`
        : `❌ Build FAILED (${buildResult.duration}ms)`
      );
    }

    if (deploymentResult.gitReady) {
      parts.push('✅ Git repository ready (init + commit)');
    } else {
      parts.push('⚠️ Git not ready');
    }

    if (deploymentResult.urlTested) {
      if (deploymentResult.urlTestResult?.statusCode === 200) {
        parts.push(`✅ Live URL verified (${deploymentResult.urlTestResult.responseTime}ms)`);
      } else {
        parts.push('❌ Live URL test failed');
      }
    }

    if (deploymentResult.errors.length > 0) {
      parts.push(`❌ ${deploymentResult.errors.length} error(s)`);
    }
    if (deploymentResult.warnings.length > 0) {
      parts.push(`⚠️ ${deploymentResult.warnings.length} warning(s)`);
    }

    if (deploymentResult.success) {
      parts.push('\n🚀 Deployment pipeline PASSED — project is ready for deployment!');
    } else {
      parts.push('\n🚫 Deployment pipeline has issues — see errors above');
    }

    return parts.join(' | ');
  }

  /**
   * Build a summary string from deployment results
   */
  private buildSummary(
    buildVerified: boolean,
    gitReady: boolean,
    urlTested: boolean,
    errors: string[],
    warnings: string[]
  ): string {
    if (buildVerified && gitReady && errors.length === 0) {
      if (urlTested) {
        return 'Deployment pipeline complete: Build ✅, Git ✅, URL ✅. Ready to ship!';
      }
      return 'Deployment pipeline ready: Build ✅, Git ✅. Ready for deployment to Render.';
    }

    const parts: string[] = [];
    if (!buildVerified) parts.push('Build FAILED');
    if (!gitReady) parts.push('Git not ready');
    if (errors.length > 0) parts.push(`${errors.length} error(s)`);
    if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);

    return `Deployment pipeline issues: ${parts.join(', ')}. Fix before deploying.`;
  }

  /**
   * Create a fallback response when AI fails but we have real deployment results
   */
  private createBuildOnlyResponse(
    checklist: DevOpsChecklist | null,
    buildResult: { success: boolean; stdout: string; stderr: string; duration: number } | null,
    gitResult: { initOk: boolean; addOk: boolean; commitOk: boolean; commitMessage: string } | null,
    urlTestResult: UrlTestResult | null,
    projectId: string | null
  ): AgentResponse {
    if (!checklist && !buildResult) {
      return this.createResponse(
        'devops-task',
        'needs_clarification',
        {
          analysis: 'I could not complete the deployment pipeline. The workspace may not be ready.',
          statusUpdate: '⚠️ DevOps could not run deployment pipeline. Workspace may not exist yet. Try building first.',
        },
        0.3
      );
    }

    const buildVerified = buildResult?.success ?? false;
    const gitReady = (gitResult?.initOk ?? false) && (gitResult?.commitOk ?? false);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (buildResult && !buildResult.success) {
      errors.push(`Build failed: ${buildResult.stderr.substring(0, 300)}`);
    }
    if (gitResult && !gitResult.initOk) {
      warnings.push('Git init failed');
    }
    if (gitResult && !gitResult.commitOk) {
      warnings.push('Git commit failed');
    }

    const overallSuccess = buildVerified && errors.length === 0;

    // Generate deployment config files even if AI is unavailable
    const files: FileChange[] = this.generateDefaultDeploymentFiles(projectId || 'unknown');

    return this.createResponse(
      'devops-task',
      overallSuccess ? 'success' : 'failed',
      {
        analysis: `Deployment pipeline (build-only analysis): Build ${buildVerified ? 'PASS' : 'FAIL'}, Git ${gitReady ? 'READY' : 'NOT READY'}, URL ${urlTestResult ? (urlTestResult.statusCode === 200 ? 'OK' : 'FAIL') : 'NOT TESTED'}. ${errors.length} error(s), ${warnings.length} warning(s).`,
        files,
        statusUpdate: overallSuccess
          ? `✅ Deployment pipeline ready (build-only analysis) — Build PASSED, Git ${gitReady ? 'READY' : 'NOT READY'}. Generated deployment configs.`
          : `❌ Deployment pipeline FAILED — Build ${buildVerified ? 'PASSED' : 'FAILED'}. ${errors.length} error(s) need fixing before deployment.`,
        nextSteps: overallSuccess
          ? ['Deploy to Render', 'Test live URL after deployment']
          : ['Fix build errors', 'Re-run DevOps pipeline'],
      },
      overallSuccess ? 0.6 : 0.4
    );
  }

  /**
   * Generate default deployment configuration files
   * These are created when AI is unavailable but we still need deployment configs
   */
  private generateDefaultDeploymentFiles(projectId: string): FileChange[] {
    const projectName = `aion-${projectId.substring(0, 8)}`;

    const renderYaml = `services:
  - type: web
    name: ${projectName}
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    plan: free
    envVars:
      - key: NODE_ENV
        value: production`;

    const gitignore = `node_modules/
.next/
.env
.env.local
.env.production
*.log
.DS_Store
dist/
coverage/
.vercel/
.turbo/`;

    const healthEndpoint = `import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '${projectName}',
  });
}`;

    return [
      {
        path: 'render.yaml',
        content: renderYaml,
        action: 'create',
        description: 'Render deployment configuration',
      },
      {
        path: '.gitignore',
        content: gitignore,
        action: 'create',
        description: 'Git ignore rules — prevents committing secrets and build artifacts',
      },
      {
        path: 'src/app/api/health/route.ts',
        content: healthEndpoint,
        action: 'create',
        description: 'Health check endpoint for deployment monitoring',
      },
    ];
  }
}
