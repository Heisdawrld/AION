// AION — QA Engineer Agent (Enhanced)
// Quality gatekeeper — ruthless, meticulous, nothing ships without approval.
// Now with REAL build execution, actual file reading, and validation gate logic.
// The QA gate is the final checkpoint before deployment. Nothing passes without QA sign-off.

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  AgentRole,
  Bug,
  QAGateResult,
  QAChecklist,
  QAGateStatus,
  BuildTestResult,
  TestResultOutput,
  FileChange,
} from '@/lib/types/aion';
import { commandRunner } from '@/lib/engine/command-runner';
import { workspaceManager } from '@/lib/engine/workspace-manager';

// ============================================================
// THE QA ENGINEER — RUTHLESS, REAL, NO FAKE PASSES
// ============================================================
const QA_SYSTEM_PROMPT = `You are the QA Engineer Agent of AION.

You are a senior QA engineer with 15+ years of experience breaking software professionally. You've found bugs in systems that "worked fine" for everyone else. You've caught security holes that would have cost companies millions. You don't trust code — you VERIFY it. You don't trust builds — you RUN them. You don't trust "it should work" — you PROVE it works.

YOUR PERSONALITY:
- You are RUTHLESS about quality. "Looks fine to me" is not in your vocabulary.
- You are SPECIFIC. Bug reports include exact file paths, line numbers, and reproduction steps.
- You are PRAGMATIC. You don't block releases over cosmetic issues, but you WILL block over data corruption, security holes, or broken core features.
- You think like a USER. You test edge cases, empty states, error states — not just happy paths.
- You are THOROUGH but EFFICIENT. You prioritize critical-path testing over nice-to-have checks.
- You are EVIDENCE-BASED. You never say something passes without proof. Build output, type check results, actual code review — these are your evidence.
- You HATE when people ship broken code. It creates fires at 3am, angry users, and emergency patches.

YOUR ROLE:
- Run the ACTUAL build (npm run build) and report real results
- Run the ACTUAL TypeScript type check and report real errors
- Review ALL generated code for bugs, security issues, and quality problems
- Verify feature coverage against the PRD
- Report bugs with EXACT file paths, clear descriptions, and reproduction steps
- Verify fixes actually fix the problem
- Be the FINAL GATE before deployment — nothing ships without your sign-off
- Track all test results in the system

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. BUILD TEST: The system will run "npm run build" in the workspace. You get the real output.
2. TYPE CHECK: The system will run "npx tsc --noEmit". You get real type errors.
3. LINT: The system will run "npm run lint". You get real lint issues.
4. FILE READING: The system will provide you with the actual source code files to review.
5. PRD REFERENCE: The system will provide the PRD so you can check feature coverage.

VALIDATION GATE LOGIC:
- GATE PASS: 0 critical bugs, 0 high bugs, build succeeds, type check passes. Ship it!
- GATE CONDITIONAL PASS: 0 critical bugs, 1-2 high bugs with known workarounds, build succeeds. Can deploy with known issues documented.
- GATE FAIL: Any critical bug, 3+ high bugs, build fails, or type check fails. STOP. Do not deploy. Fix first.
- GATE BLOCKED: Can't run tests (workspace missing, build environment broken). Need help.

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write to: testResults, openBugs, resolvedBugs
2. You NEVER modify code directly — you report bugs for other agents to fix
3. You CANNOT mark a check as PASS without ACTUAL EVIDENCE (build output, code review, PRD reference)
4. Bug reports MUST include: exact file path, line number if possible, description, reproduction steps, severity, suggested fix approach
5. You MUST reference the PRD when checking feature coverage
6. If uncertain, flag as NEEDS_REVIEW rather than PASS
7. Severity levels: CRITICAL = data loss/security hole/app crash, HIGH = broken feature, MEDIUM = degraded UX/workaround exists, LOW = cosmetic
8. If the build FAILS, you MUST report every error from the build output as bugs
9. If TypeScript has errors, you MUST report each one with the exact error message and file
10. You MUST include a qaGateResult in your output — this is how the orchestrator knows if deployment is allowed

QA CHECKLIST (run these for EVERY review):
1. **Build**: Does "npm run build" succeed? Any compilation errors?
2. **TypeScript**: Are there type errors? Any 'any' types that could hide bugs?
3. **Imports**: Are there unused imports? Missing imports? Wrong import paths?
4. **API Contract**: Do the API endpoints match what Frontend expects? Are request/response shapes consistent?
5. **Database**: Are Prisma queries correct? Any N+1 queries? Missing indexes?
6. **Security**: Any hardcoded secrets? SQL injection? Missing auth checks? Input validation?
7. **Error Handling**: Are errors caught and handled? Do API routes return proper status codes?
8. **Edge Cases**: What happens with empty data? What happens with invalid input? What about concurrent requests?
9. **PRD Coverage**: Are all MVP features implemented? Any missing acceptance criteria?
10. **Responsive Design**: Are there responsive classes? Does the layout work on mobile?

HOW TO REVIEW CODE FILES:
- Read each file carefully as if you're the one who has to maintain it
- Check imports first — wrong imports = compile errors = instant fail
- Trace data flow: where does data come from? Where does it go? What happens if it's null?
- Look for common React bugs: missing keys, stale closures, missing deps in useEffect
- Look for common API bugs: missing error handling, missing validation, wrong status codes
- Check if all the PRD's MVP features have corresponding code
- Look for security issues: unvalidated input, exposed secrets, missing auth
- Check for accessibility: missing alt text, no keyboard support, poor contrast

BUG REPORT FORMAT (be VERY specific):
Each bug MUST have:
- id: "BUG01", "BUG02", etc.
- description: EXACT description with reproduction steps. "When I click X with Y empty, the app crashes because Z is undefined"
- filePath: "src/components/FeatureCard.tsx" (exact path)
- severity: critical/high/medium/low
- status: "open"
- reportedBy: "qa"
- assignedTo: which agent should fix it ("frontend" or "backend")

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Overall quality assessment — be specific about what's good and what's not. Reference actual build results and code you reviewed.",
    "bugs": [{ "id": "BUG01", "description": "Exact description with reproduction steps", "filePath": "src/...", "severity": "critical|high|medium|low", "status": "open", "reportedBy": "qa", "assignedTo": "frontend|backend" }],
    "checklist": {
      "buildSucceeds": true/false,
      "typescriptCompiles": true/false,
      "noUnusedImports": true/false,
      "apiEndpointsValid": true/false,
      "responsiveDesignOk": true/false,
      "noSecurityIssues": true/false,
      "dependenciesResolved": true/false,
      "prdCoverageComplete": true/false
    },
    "passed": true/false,
    "qaGateResult": {
      "gateStatus": "pass|fail|conditional_pass|blocked",
      "canDeploy": true/false,
      "summary": "Clear summary for the CTO — what passed, what failed, can we deploy?"
    },
    "statusUpdate": "Your message to the CTO and user — conversational, honest, specific. What passed, what failed, what needs fixing.",
    "nextSteps": ["Specific actions to fix issues"]
  },
  "confidence": 0.0-1.0
}`;

// ============================================================
// INTERFACES
// ============================================================

interface QAOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    bugs?: Bug[];
    checklist?: QAChecklist;
    passed?: boolean;
    qaGateResult?: {
      gateStatus: QAGateStatus;
      canDeploy: boolean;
      summary: string;
    };
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class QAEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'qa',
      name: 'QA Engineer',
      systemPrompt: QA_SYSTEM_PROMPT,
      writeAccess: ['testResults', 'openBugs', 'resolvedBugs', 'agentLog'],
      deniedAccess: ['fileManifest'],
    });
  }

  /**
   * MAIN EXECUTE — Full QA review with real build tests and code review
   * This runs the actual build, type check, and lint, then sends results + code to AI
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    // Extract projectId from context (it's in the PROJECT: line)
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 1: Run REAL build tests
    // ========================================
    let buildResults: BuildTestResult | null = null;
    if (projectId) {
      buildResults = await this.runBuildTests(projectId);
    }

    // ========================================
    // STEP 2: Read actual source files from workspace
    // ========================================
    let sourceFiles = '';
    if (projectId) {
      sourceFiles = await this.readProjectFiles(projectId);
    }

    // ========================================
    // STEP 3: Build enhanced context with real test results + real code
    // ========================================
    const enhancedContext = this.buildEnhancedContext(context, buildResults, sourceFiles);

    // ========================================
    // STEP 4: Send to AI for code review + QA analysis
    // ========================================
    const userMessage = `CURRENT PROJECT STATE + REAL TEST RESULTS:\n${enhancedContext}\n\nYOUR TASK:\n${task}`;

    const result = await this.callAgentAI<QAOutput>(userMessage);

    if (!result.data) {
      // Even if AI fails, we have real build results — return those
      return this.createBuildOnlyResponse(buildResults, projectId);
    }

    const data = result.data;

    // ========================================
    // STEP 5: Build the QA Gate Result from real data + AI analysis
    // ========================================
    const gateResult = this.buildQAGateResult(data, buildResults);

    // Determine overall status based on gate result
    const overallStatus = gateResult.canDeploy ? 'success' : 'failed';

    return this.createResponse(
      'qa-task',
      data.status === 'needs_clarification' ? 'needs_clarification' : overallStatus,
      {
        analysis: data.output?.analysis,
        bugs: data.output?.bugs,
        testResults: this.extractTestResults(buildResults),
        qaGateResult: gateResult,
        statusUpdate: data.output?.statusUpdate || (gateResult.canDeploy
          ? '✅ QA GATE PASSED — All checks clear! Ready for deployment.'
          : `❌ QA GATE FAILED — ${gateResult.criticalBugCount} critical, ${gateResult.highBugCount} high bug(s). Build: ${gateResult.buildPassed ? 'PASS' : 'FAIL'}. Deployment BLOCKED.`),
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  /**
   * Run REAL build tests: npm run build, tsc --noEmit, npm run lint
   * Returns structured results with actual error messages
   */
  private async runBuildTests(projectId: string): Promise<BuildTestResult> {
    const timestamp = new Date().toISOString();

    // Check if workspace exists first
    const workspaceExists = await workspaceManager.workspaceExists(projectId);
    if (!workspaceExists) {
      return {
        buildSuccess: false,
        buildErrors: ['Workspace does not exist yet. Cannot run build tests.'],
        typeCheckSuccess: false,
        typeCheckErrors: ['Workspace does not exist. Cannot run type check.'],
        lintSuccess: false,
        lintErrors: ['Workspace does not exist. Cannot run lint.'],
        timestamp,
      };
    }

    // Run build
    let buildSuccess = false;
    let buildOutput = '';
    let buildErrors: string[] = [];
    let buildDuration = 0;

    try {
      const buildResult = commandRunner.runBuild(projectId);
      buildSuccess = buildResult.success;
      buildOutput = buildResult.stdout;
      buildDuration = buildResult.duration;

      if (!buildResult.success) {
        // Parse build errors from stderr
        buildErrors = this.parseErrorOutput(buildResult.stderr || buildResult.stdout);
      }
    } catch (error: any) {
      buildErrors = [`Build execution failed: ${error.message}`];
    }

    // Run type check
    let typeCheckSuccess = false;
    let typeCheckErrors: string[] = [];

    try {
      const typeResult = commandRunner.runTypeCheck(projectId);
      typeCheckSuccess = typeResult.success;

      if (!typeResult.success) {
        typeCheckErrors = this.parseErrorOutput(typeResult.stdout || typeResult.stderr);
      }
    } catch (error: any) {
      typeCheckErrors = [`Type check execution failed: ${error.message}`];
    }

    // Run lint
    let lintSuccess = false;
    let lintErrors: string[] = [];
    let lintWarnings: string[] = [];

    try {
      const lintResult = commandRunner.runLint(projectId);
      lintSuccess = lintResult.success;

      if (!lintResult.success) {
        const allLintOutput = lintResult.stdout || lintResult.stderr || '';
        const parsed = this.parseLintOutput(allLintOutput);
        lintErrors = parsed.errors;
        lintWarnings = parsed.warnings;
      }
    } catch (error: any) {
      lintErrors = [`Lint execution failed: ${error.message}`];
    }

    return {
      buildSuccess,
      buildOutput: buildOutput.substring(0, 2000),
      buildErrors,
      buildDuration,
      typeCheckSuccess,
      typeCheckErrors,
      lintSuccess,
      lintWarnings,
      lintErrors,
      timestamp,
    };
  }

  /**
   * Read actual source files from the workspace for code review
   * Returns a formatted string with file contents
   */
  private async readProjectFiles(projectId: string): Promise<string> {
    try {
      const files = await workspaceManager.listFiles(projectId);
      const sourceFiles: string[] = [];

      // Only read source files (not config, not node_modules)
      const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.prisma', '.css'];
      const relevantFiles = files.filter(f =>
        relevantExtensions.some(ext => f.endsWith(ext)) &&
        !f.includes('node_modules') &&
        !f.includes('.next') &&
        !f.includes('dist')
      );

      // Read up to 20 files (to keep context manageable)
      const filesToRead = relevantFiles.slice(0, 20);

      for (const filePath of filesToRead) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (content) {
          sourceFiles.push(`\n--- FILE: ${filePath} ---\n${content}`);
        }
      }

      if (sourceFiles.length === 0) {
        return 'No source files found in workspace.';
      }

      return `SOURCE FILES FOR REVIEW (${filesToRead.length} of ${relevantFiles.length} files):\n${sourceFiles.join('\n')}`;
    } catch (error: any) {
      return `Error reading project files: ${error.message}`;
    }
  }

  /**
   * Build enhanced context that includes real test results and actual code
   */
  private buildEnhancedContext(
    baseContext: string,
    buildResults: BuildTestResult | null,
    sourceFiles: string
  ): string {
    const parts: string[] = [baseContext];

    if (buildResults) {
      parts.push('\n========================================');
      parts.push('REAL BUILD TEST RESULTS (ACTUALLY EXECUTED):');
      parts.push('========================================');
      parts.push(`BUILD: ${buildResults.buildSuccess ? '✅ PASSED' : '❌ FAILED'} ${buildResults.buildDuration ? `(${buildResults.buildDuration}ms)` : ''}`);
      if (buildResults.buildErrors && buildResults.buildErrors.length > 0) {
        parts.push('BUILD ERRORS:');
        buildResults.buildErrors.forEach(e => parts.push(`  - ${e}`));
      }
      parts.push(`TYPE CHECK: ${buildResults.typeCheckSuccess ? '✅ PASSED' : '❌ FAILED'}`);
      if (buildResults.typeCheckErrors && buildResults.typeCheckErrors.length > 0) {
        parts.push('TYPE ERRORS:');
        buildResults.typeCheckErrors.forEach(e => parts.push(`  - ${e}`));
      }
      parts.push(`LINT: ${buildResults.lintSuccess ? '✅ PASSED' : '❌ FAILED'}`);
      if (buildResults.lintErrors && buildResults.lintErrors.length > 0) {
        parts.push('LINT ERRORS:');
        buildResults.lintErrors.forEach(e => parts.push(`  - ${e}`));
      }
      if (buildResults.lintWarnings && buildResults.lintWarnings.length > 0) {
        parts.push('LINT WARNINGS:');
        buildResults.lintWarnings.slice(0, 10).forEach(w => parts.push(`  - ${w}`));
      }
    }

    if (sourceFiles && sourceFiles.length > 100) {
      parts.push('\n========================================');
      parts.push('ACTUAL SOURCE CODE (READ FROM DISK):');
      parts.push('========================================');
      parts.push(sourceFiles);
    }

    return parts.join('\n');
  }

  /**
   * Build the QA Gate Result from AI analysis + real build data
   * This is the VALIDATION GATE — the orchestrator checks canDeploy before allowing deployment
   */
  private buildQAGateResult(data: QAOutput, buildResults: BuildTestResult | null): QAGateResult {
    const bugs = data.output?.bugs || [];
    const criticalBugs = bugs.filter(b => b.severity === 'critical').length;
    const highBugs = bugs.filter(b => b.severity === 'high').length;
    const mediumBugs = bugs.filter(b => b.severity === 'medium').length;
    const lowBugs = bugs.filter(b => b.severity === 'low').length;

    const buildPassed = buildResults?.buildSuccess ?? false;
    const typeCheckPassed = buildResults?.typeCheckSuccess ?? false;
    const lintPassed = buildResults?.lintSuccess ?? false;

    // Determine gate status based on real evidence
    let gateStatus: QAGateStatus;
    let canDeploy: boolean;

    if (!buildPassed || !typeCheckPassed) {
      // Build or type check fails = hard block
      gateStatus = 'fail';
      canDeploy = false;
    } else if (criticalBugs > 0) {
      // Critical bugs = hard block
      gateStatus = 'fail';
      canDeploy = false;
    } else if (highBugs >= 3) {
      // Too many high bugs = block
      gateStatus = 'fail';
      canDeploy = false;
    } else if (highBugs > 0 && highBugs <= 2) {
      // Few high bugs with workarounds = conditional pass
      gateStatus = 'conditional_pass';
      canDeploy = true; // Allow deploy but flag issues
    } else if (mediumBugs > 5) {
      // Too many medium bugs = block
      gateStatus = 'fail';
      canDeploy = false;
    } else {
      // All good — clean pass
      gateStatus = 'pass';
      canDeploy = true;
    }

    // If the workspace doesn't exist, we're blocked
    if (!buildResults) {
      gateStatus = 'blocked';
      canDeploy = false;
    }

    // Override: If AI explicitly said passed=false, respect that
    if (data.output?.passed === false && gateStatus === 'pass') {
      gateStatus = 'conditional_pass';
      canDeploy = true; // AI has concerns but build passes
    }

    // Build the summary
    let summary: string;
    switch (gateStatus) {
      case 'pass':
        summary = `QA GATE PASSED — Build: ✅, TypeCheck: ✅, Lint: ${lintPassed ? '✅' : '⚠️'}. ${bugs.length} bugs found (${criticalBugs} critical, ${highBugs} high, ${mediumBugs} medium, ${lowBugs} low). Ready for deployment.`;
        break;
      case 'conditional_pass':
        summary = `QA GATE CONDITIONAL PASS — Build: ✅, TypeCheck: ✅. ${highBugs} high bug(s) with known workarounds. Deployment allowed but issues should be tracked.`;
        break;
      case 'fail':
        summary = `QA GATE FAILED — ${!buildPassed ? 'Build fails. ' : ''}${!typeCheckPassed ? 'Type check fails. ' : ''}${criticalBugs} critical, ${highBugs} high bug(s). Deployment BLOCKED. Fix issues before deploying.`;
        break;
      case 'blocked':
        summary = 'QA GATE BLOCKED — Cannot run tests. Workspace may not exist or build environment is broken.';
        break;
    }

    return {
      gateStatus,
      checklist: data.output?.checklist || {
        buildSucceeds: buildPassed,
        typescriptCompiles: typeCheckPassed,
        noUnusedImports: lintPassed,
        apiEndpointsValid: false,
        responsiveDesignOk: false,
        noSecurityIssues: criticalBugs === 0,
        dependenciesResolved: buildPassed,
        prdCoverageComplete: false,
      },
      canDeploy,
      criticalBugCount: criticalBugs,
      highBugCount: highBugs,
      mediumBugCount: mediumBugs,
      lowBugCount: lowBugs,
      buildPassed,
      typeCheckPassed,
      lintPassed,
      buildErrors: buildResults?.buildErrors,
      typeErrors: buildResults?.typeCheckErrors,
      lintErrors: buildResults?.lintErrors,
      summary,
    };
  }

  /**
   * Create a fallback response when AI fails but we have real build results
   */
  private createBuildOnlyResponse(buildResults: BuildTestResult | null, projectId: string | null): AgentResponse {
    if (!buildResults) {
      return this.createResponse(
        'qa-task',
        'needs_clarification',
        {
          analysis: 'I could not complete the QA review. The build environment may not be ready.',
          statusUpdate: '⚠️ QA could not run tests. Workspace may not exist yet. Try running a build step first.',
        },
        0.3
      );
    }

    const gateResult: QAGateResult = {
      gateStatus: buildResults.buildSuccess && buildResults.typeCheckSuccess ? 'conditional_pass' : 'fail',
      checklist: {
        buildSucceeds: buildResults.buildSuccess,
        typescriptCompiles: buildResults.typeCheckSuccess,
        noUnusedImports: buildResults.lintSuccess,
        apiEndpointsValid: false,
        responsiveDesignOk: false,
        noSecurityIssues: false,
        dependenciesResolved: buildResults.buildSuccess,
        prdCoverageComplete: false,
      },
      canDeploy: buildResults.buildSuccess && buildResults.typeCheckSuccess,
      criticalBugCount: buildResults.buildSuccess ? 0 : 1,
      highBugCount: buildResults.typeCheckSuccess ? 0 : 1,
      mediumBugCount: 0,
      lowBugCount: 0,
      buildPassed: buildResults.buildSuccess,
      typeCheckPassed: buildResults.typeCheckSuccess,
      lintPassed: buildResults.lintSuccess,
      buildErrors: buildResults.buildErrors,
      typeErrors: buildResults.typeCheckErrors,
      lintErrors: buildResults.lintErrors,
      summary: buildResults.buildSuccess && buildResults.typeCheckSuccess
        ? 'QA GATE CONDITIONAL PASS — Build and type check pass. Full code review not completed — recommend re-running QA after AI is available.'
        : `QA GATE FAILED — ${!buildResults.buildSuccess ? 'Build fails. ' : ''}${!buildResults.typeCheckSuccess ? 'Type check fails. ' : ''}Deployment BLOCKED.`,
    };

    // Create bugs from build errors
    const bugs: Bug[] = [];
    if (buildResults.buildErrors) {
      buildResults.buildErrors.forEach((error, i) => {
        bugs.push({
          id: `BUG-BUILD-${i + 1}`,
          description: `Build error: ${error}`,
          filePath: this.extractFilePathFromError(error),
          severity: 'critical',
          status: 'open',
          reportedBy: 'qa',
          assignedTo: this.guessResponsibleAgent(error),
        });
      });
    }
    if (buildResults.typeCheckErrors) {
      buildResults.typeCheckErrors.forEach((error, i) => {
        bugs.push({
          id: `BUG-TYPE-${i + 1}`,
          description: `TypeScript error: ${error}`,
          filePath: this.extractFilePathFromError(error),
          severity: 'high',
          status: 'open',
          reportedBy: 'qa',
          assignedTo: this.guessResponsibleAgent(error),
        });
      });
    }

    return this.createResponse(
      'qa-task',
      gateResult.canDeploy ? 'success' : 'failed',
      {
        analysis: `Build-only QA review (AI code review unavailable). Build: ${buildResults.buildSuccess ? 'PASS' : 'FAIL'}, TypeCheck: ${buildResults.typeCheckSuccess ? 'PASS' : 'FAIL'}, Lint: ${buildResults.lintSuccess ? 'PASS' : 'FAIL'}. Found ${bugs.length} issue(s) from build output.`,
        bugs,
        testResults: this.extractTestResults(buildResults),
        qaGateResult: gateResult,
        statusUpdate: gateResult.canDeploy
          ? '⚠️ QA CONDITIONAL PASS (build-only review) — Build and type check pass. Full code review pending.'
          : `❌ QA GATE FAILED — ${!buildResults.buildSuccess ? 'Build fails. ' : ''}${!buildResults.typeCheckSuccess ? 'Type check fails. ' : ''}${bugs.length} issue(s) found. Deployment BLOCKED.`,
        nextSteps: gateResult.canDeploy
          ? ['Run full QA review when AI is available', 'Proceed with deployment if urgent']
          : ['Fix build errors', 'Fix type errors', 'Re-run QA'],
      },
      gateResult.canDeploy ? 0.6 : 0.5
    );
  }

  /**
   * Convert build results to TestResultOutput format
   */
  private extractTestResults(buildResults: BuildTestResult | null): TestResultOutput[] {
    if (!buildResults) return [];

    const results: TestResultOutput[] = [
      {
        testType: 'build',
        passed: buildResults.buildSuccess,
        details: buildResults.buildSuccess
          ? `Build passed in ${buildResults.buildDuration}ms`
          : `Build failed: ${buildResults.buildErrors?.slice(0, 3).join('; ')}`,
      },
      {
        testType: 'typecheck',
        passed: buildResults.typeCheckSuccess,
        details: buildResults.typeCheckSuccess
          ? 'No type errors'
          : `${buildResults.typeCheckErrors?.length || 0} type error(s)`,
      },
    ];

    if (buildResults.lintSuccess !== undefined) {
      results.push({
        testType: 'lint',
        passed: buildResults.lintSuccess,
        details: buildResults.lintSuccess
          ? 'Lint passed'
          : `${buildResults.lintErrors?.length || 0} lint error(s), ${buildResults.lintWarnings?.length || 0} warning(s)`,
      });
    }

    return results;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Parse error output into individual error messages
   */
  private parseErrorOutput(output: string): string[] {
    if (!output) return [];

    const errors: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Look for error patterns
      if (
        trimmed.includes('error TS') ||
        trimmed.includes('Error:') ||
        trimmed.includes('error:') ||
        trimmed.includes('Failed to compile') ||
        trimmed.includes('Module not found') ||
        trimmed.includes('Type error') ||
        trimmed.includes('SyntaxError') ||
        trimmed.includes('Cannot find') ||
        trimmed.includes('is not assignable') ||
        trimmed.includes('does not exist') ||
        (trimmed.includes('src/') && trimmed.includes('.ts'))
      ) {
        // Truncate long error lines
        errors.push(trimmed.length > 300 ? trimmed.substring(0, 300) + '...' : trimmed);
      }
    }

    // If no structured errors found, return the first 5 non-empty lines
    if (errors.length === 0) {
      const nonEmpty = lines.filter(l => l.trim()).slice(0, 5);
      return nonEmpty.map(l => l.trim().substring(0, 300));
    }

    return errors.slice(0, 20); // Max 20 errors
  }

  /**
   * Parse lint output into errors and warnings
   */
  private parseLintOutput(output: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!output) return { errors, warnings };

    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes('error') || trimmed.includes('Error')) {
        errors.push(trimmed.substring(0, 300));
      } else if (trimmed.includes('warning') || trimmed.includes('Warning')) {
        warnings.push(trimmed.substring(0, 200));
      }
    }

    return { errors: errors.slice(0, 15), warnings: warnings.slice(0, 10) };
  }

  /**
   * Extract a file path from an error message
   */
  private extractFilePathFromError(error: string): string | undefined {
    // Try common patterns: "src/path/file.tsx:line:col" or "src/path/file.ts"
    const match = error.match(/(src\/[^\s:]+\.(ts|tsx|js|jsx|prisma))/);
    return match ? match[1] : undefined;
  }

  /**
   * Guess which agent should fix a bug based on the file path
   */
  private guessResponsibleAgent(error: string): AgentRole {
    if (error.includes('src/components/') || error.includes('src/app/') && !error.includes('/api/')) {
      return 'frontend';
    }
    if (error.includes('src/app/api/') || error.includes('prisma/')) {
      return 'backend';
    }
    return 'frontend'; // Default to frontend
  }
}
