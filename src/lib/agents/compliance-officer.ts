// AION — Compliance Officer Agent
// License auditing, GDPR compliance, data privacy, accessibility standards, and legal risk.
// "If it's not compliant, it's not shippable. I protect users AND the business."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';
import { workspaceManager } from '@/lib/engine/workspace-manager';
import { commandRunner } from '@/lib/engine/command-runner';

// ============================================================
// THE COMPLIANCE OFFICER — PROTECTING USERS AND THE BUSINESS
// ============================================================
const COMPLIANCE_SYSTEM_PROMPT = `You are the Compliance Officer Agent of AION. Protect users and the business. One missed GPL license can sink an acquisition. One GDPR violation can cost 4% of global revenue. Audit everything.

ROLE: Audit npm licenses, review data collection for GDPR/CCPA, check cookie consent, verify WCAG 2.1 AA accessibility, review privacy policy needs, audit open-source obligations, check COPPA, generate compliance docs, create cookie consent components.

CATEGORIES:
1. LICENSING: Permissive (MIT/BSD/Apache) = safe with attribution. Weak copyleft (LGPL/MPL) = modifications shared. Strong copyleft (GPL/AGPL) = derivative works same license — CRITICAL RISK for proprietary. Flag all GPL/AGPL.
2. GDPR/CCPA: Lawful basis, data minimization, purpose limitation, storage limitation, data rights (access/erase/port), cookie consent, privacy policy, breach notification (72h).
3. WCAG 2.1 AA: Perceivable (alt text, contrast), Operable (keyboard nav, skip links), Understandable (labels, errors), Robust (valid HTML, ARIA).
4. COPPA: Parental consent for under 13, limited data, no behavioral ads.
5. SECURITY: Encryption, access controls, audit logging, incident response.

RISK: CRITICAL (GPL in proprietary, GDPR violation), HIGH (missing privacy policy, no cookie consent, a11y failures), MEDIUM (missing attribution), LOW (best practices), INFO (awareness).

FILES: Only write compliance files: privacy policies, cookie consent, terms, LICENSE. Never modify application code.

RULES:
1. Base license findings on ACTUAL dependency scans
2. Distinguish regulatory requirements vs best practices
3. Provide specific legal references (GDPR Article, WCAG criterion)
4. Explain business impact of each issue
5. Don't give legal advice — provide compliance analysis
6. Flag dependencies creating legal risk

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"PRIVACY.md","content":"...","action":"create","description":"..."}],"licenseAudit":[{"package":"...","version":"...","license":"...","risk":"none|low|medium|high|critical","notes":"..."}],"privacyFindings":[{"category":"gdpr|ccpa|coppa","issue":"...","risk":"...","remediation":"..."}],"accessibilityFindings":[{"wcagCriterion":"...","issue":"...","risk":"...","remediation":"..."}],"overallRisk":"clean|low|medium|high|critical","complianceScore":0,"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface ComplianceOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    licenseAudit?: { package: string; version: string; license: string; risk: string; notes: string }[];
    privacyFindings?: { category: string; issue: string; risk: string; remediation: string }[];
    accessibilityFindings?: { wcagCriterion: string; issue: string; risk: string; remediation: string }[];
    overallRisk?: string;
    complianceScore?: number;
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class ComplianceOfficerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'compliance',
      name: 'Compliance Officer',
      systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:compliance', 'complianceReport', 'agentLog'],
      deniedAccess: ['src/app/api/**', 'prisma/**', 'testResults', 'deployStatus'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 1: Scan dependencies for licenses
    // ========================================
    let licenseScan = '';
    if (projectId) {
      licenseScan = await this.scanLicenses(projectId);
    }

    // ========================================
    // STEP 2: Read source files for data handling
    // ========================================
    let sourceAnalysis = '';
    if (projectId) {
      sourceAnalysis = await this.analyzeSourceCode(projectId);
    }

    // ========================================
    // STEP 3: Build enhanced context
    // ========================================
    const enhancedContext = [
      context,
      licenseScan ? `\n\nLICENSE SCAN RESULTS:\n${licenseScan}` : '',
      sourceAnalysis ? `\n\nSOURCE CODE COMPLIANCE ANALYSIS:\n${sourceAnalysis}` : '',
    ].join('');

    const userMessage = `COMPLIANCE ANALYSIS DATA:\n${enhancedContext}\n\nYOUR COMPLIANCE TASK:\n${task}`;

    const result = await this.callAgentAI<ComplianceOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'compliance-task',
        'needs_clarification',
        { analysis: 'I had trouble completing the compliance audit. The project may not be ready for review.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'compliance-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  // ============================================================
  // REAL COMPLIANCE SCANS
  // ============================================================

  private async scanLicenses(projectId: string): Promise<string> {
    try {
      // Run npm ls to get dependency tree
      const result = commandRunner.runInWorkspace(projectId, 'npm ls --json --all 2>/dev/null || true', { timeout: 30000 });

      const parts: string[] = [];

      try {
        const tree = JSON.parse(result.stdout);
        const deps = this.flattenDependencyTree(tree);
        const depCount = deps.length;

        parts.push(`TOTAL DEPENDENCIES: ${depCount}`);

        // Categorize by license
        const licenseGroups: Record<string, string[]> = {};
        const riskyDeps: string[] = [];

        for (const dep of deps) {
          const license = dep.license || 'UNKNOWN';
          if (!licenseGroups[license]) licenseGroups[license] = [];
          licenseGroups[license].push(`${dep.name}@${dep.version}`);

          // Flag risky licenses
          const licenseLower = license.toLowerCase();
          if (licenseLower.includes('gpl') || licenseLower.includes('agpl') || licenseLower.includes('copyleft')) {
            riskyDeps.push(`⚠️ ${dep.name}@${dep.version}: ${license} (COPYLEFT — may require source disclosure)`);
          }
          if (license === 'UNKNOWN' || license.includes('UNLICENSED')) {
            riskyDeps.push(`⚠️ ${dep.name}@${dep.version}: ${license} (no clear license — cannot use without permission)`);
          }
        }

        // License summary
        parts.push('\nLICENSE SUMMARY:');
        for (const [license, packages] of Object.entries(licenseGroups)) {
          parts.push(`  ${license}: ${packages.length} packages`);
        }

        // Flag risky licenses
        if (riskyDeps.length > 0) {
          parts.push(`\nRISKY LICENSES (${riskyDeps.length}):`);
          riskyDeps.forEach(d => parts.push(`  ${d}`));
        } else {
          parts.push('\nNo risky licenses detected.');
        }

      } catch {
        // If JSON parse fails, return raw output
        parts.push(`Raw npm ls output:\n${result.stdout.substring(0, 2000)}`);
      }

      return parts.join('\n');
    } catch (error: any) {
      return `License scan failed: ${error.message}`;
    }
  }

  private flattenDependencyTree(tree: any, prefix: string = ''): { name: string; version: string; license: string }[] {
    const deps: { name: string; version: string; license: string }[] = [];

    if (tree.dependencies) {
      for (const [name, info] of Object.entries(tree.dependencies)) {
        const dep = info as any;
        deps.push({
          name,
          version: dep.version || 'unknown',
          license: dep.license || 'UNKNOWN',
        });

        if (dep.dependencies) {
          deps.push(...this.flattenDependencyTree(dep, `${prefix}${name}/`));
        }
      }
    }

    return deps;
  }

  private async analyzeSourceCode(projectId: string): Promise<string> {
    try {
      const files = await workspaceManager.listFiles(projectId);
      const relevant = files.filter(f =>
        /\.(tsx|ts|jsx|js)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('.next')
      );

      const findings: string[] = [];

      for (const filePath of relevant.slice(0, 20)) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (!content) continue;

        // GDPR / Privacy checks
        if (/localStorage\.setItem|sessionStorage\.setItem|document\.cookie/.test(content)) {
          findings.push(`DATA STORAGE: ${filePath} — Uses browser storage/cookies (may need consent under GDPR)`);
        }

        if (/fetch\(|axios\.|http\.get|http\.post/.test(content)) {
          const sendsPersonalData = /email|password|name|phone|address|ssn|birth/.test(content.toLowerCase());
          if (sendsPersonalData) {
            findings.push(`PERSONAL DATA: ${filePath} — Sends potentially personal data to server (review for GDPR compliance)`);
          }
        }

        if (/track|analytics|gtag|gtm|facebook.*pixel|mixpanel|amplitude|segment/.test(content.toLowerCase())) {
          findings.push(`TRACKING: ${filePath} — Uses analytics/tracking (requires cookie consent under GDPR/CCPA)`);
        }

        // Accessibility checks
        if (/<img\s/.test(content) && !/alt=/.test(content)) {
          findings.push(`ACCESSIBILITY: ${filePath} — Image without alt text (WCAG 1.1.1)`);
        }

        if (/<input\s/.test(content) && !/aria-label|label/.test(content)) {
          findings.push(`ACCESSIBILITY: ${filePath} — Input without label (WCAG 1.3.1)`);
        }

        if (/onClick=/.test(content) && !/onKeyDown|onKeyPress|role=|tabIndex/.test(content)) {
          findings.push(`ACCESSIBILITY: ${filePath} — Click handler without keyboard support (WCAG 2.1.1)`);
        }

        // License checks in code
        if (/\/\/\s*@(license|copyright|proprietary)/.test(content)) {
          findings.push(`LICENSE: ${filePath} — Contains license/copyright notice (review for compliance)`);
        }
      }

      if (findings.length > 0) {
        return `COMPLIANCE FINDINGS IN SOURCE CODE (${findings.length}):\n${findings.join('\n')}`;
      }

      return 'No compliance issues detected in source code scan.';
    } catch (error: any) {
      return `Source analysis error: ${error.message}`;
    }
  }
}
