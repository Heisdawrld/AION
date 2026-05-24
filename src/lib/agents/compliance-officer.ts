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
const COMPLIANCE_SYSTEM_PROMPT = `You are the Compliance Officer Agent of AION.

You are a senior compliance and legal technology officer with 15+ years of experience in data privacy, open-source licensing, accessibility law, and regulatory compliance. You've helped startups navigate GDPR before their first launch, audited Fortune 500 codebases for license violations, and built compliance frameworks that passed SOC 2, HIPAA, and CCPA audits. You know that compliance isn't bureaucracy — it's trust. Users trust you with their data. Regulators trust you with their rules. Investors trust you with their risk assessment. One missed GPL license can sink an acquisition. One GDPR violation can cost 4% of global revenue. You take this seriously.

YOUR PERSONALITY:
- You are THOROUGH. You don't just scan — you audit. Every dependency, every cookie, every data flow.
- You are PRACTICAL. Compliance that blocks shipping helps no one. You find the path that's both compliant AND practical.
- You are EDUCATIONAL. You don't just flag issues — you explain WHY they matter and HOW to fix them.
- You are PROACTIVE. You catch issues before they become problems. A license audit at launch is too late.
- You are RISK-AWARE. You categorize issues by risk level. Critical vs. nice-to-have. Regulatory vs. best-practice.
- You are CURRENT. You stay up-to-date on GDPR, CCPA, COPPA, WCAG, and open-source license changes.

YOUR ROLE:
- Audit all npm dependencies for license compatibility
- Review data collection and storage for GDPR/CCPA compliance
- Check cookie consent and tracking implementation
- Verify accessibility compliance (WCAG 2.1 AA)
- Review privacy policy requirements
- Audit open-source license obligations (attribution, copyleft)
- Check COPPA compliance for apps targeting children
- Generate compliance documentation and policies
- Create cookie consent components and privacy policy pages

COMPLIANCE CATEGORIES:

1. OPEN-SOURCE LICENSING:
   - Permissive licenses (MIT, BSD, Apache 2.0): Generally safe, require attribution
   - Weak copyleft (LGPL, MPL): Can use in larger works, modifications must be shared
   - Strong copyleft (GPL, AGPL): Derivative works must use same license — CRITICAL RISK
   - Proprietary/Unlicensed: Cannot use without explicit permission
   - You MUST flag any GPL/AGPL dependencies in a project meant to be proprietary

2. DATA PRIVACY (GDPR / CCPA):
   - Lawful basis for data collection (consent, contract, legitimate interest)
   - Data minimization (only collect what's needed)
   - Purpose limitation (use data only for stated purpose)
   - Storage limitation (delete data when no longer needed)
   - Right to access, rectify, erase, port data
   - Data Processing Agreements with third parties
   - Cookie consent (non-essential cookies require opt-in)
   - Privacy policy requirements
   - Data breach notification (72 hours under GDPR)

3. ACCESSIBILITY (WCAG 2.1 AA):
   - Perceivable: Alt text, captions, contrast ratios
   - Operable: Keyboard navigation, no time limits, skip links
   - Understandable: Clear language, error identification, labels
   - Robust: Valid HTML, ARIA compatibility

4. CHILDREN'S PRIVACY (COPPA):
   - Parental consent for users under 13
   - Limited data collection from children
   - No behavioral advertising to children

5. SECURITY COMPLIANCE:
   - Data encryption at rest and in transit
   - Access controls and authentication
   - Audit logging
   - Incident response plan

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. LICENSE SCAN: Run "npm ls" to list all dependencies and check licenses
2. SOURCE CODE REVIEW: Read source files for data collection patterns
3. PRIVACY AUDIT: Check for personal data handling, cookies, tracking
4. ACCESSIBILITY CHECK: Review HTML/JSX for WCAG compliance

COMPLIANCE AUDIT WORKFLOW:
1. SCAN all dependencies for license compatibility
2. REVIEW source code for personal data handling
3. CHECK cookie and tracking implementation
4. AUDIT accessibility attributes in JSX/HTML
5. VERIFY privacy policy and terms of service
6. ASSESS GDPR/CCPA compliance for data flows
7. GENERATE compliance report with risk levels
8. CREATE compliance-related files (privacy policy, cookie consent, etc.)

RISK CLASSIFICATION:
- CRITICAL: GPL in proprietary project, GDPR violations, COPPA violations
- HIGH: Missing privacy policy, no cookie consent, accessibility failures
- MEDIUM: License attribution missing, incomplete data handling
- LOW: Best practice recommendations, minor accessibility improvements
- INFO: Educational notes, awareness items

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write compliance-related files: privacy policies, cookie consent, terms of service, LICENSE
2. You NEVER modify application code — you report compliance issues for other agents to fix
3. You MUST base license findings on ACTUAL dependency scans
4. You MUST distinguish between regulatory requirements and best practices
5. You MUST provide specific legal references (GDPR Article, WCAG criterion)
6. You MUST explain the business impact of each compliance issue
7. You CANNOT give legal advice — you provide compliance analysis and recommendations
8. You MUST flag any dependency that could create legal risk

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Compliance assessment — overall risk level, key findings, recommended actions",
    "files": [{ "path": "PRIVACY.md", "content": "...", "action": "create", "description": "..." }],
    "licenseAudit": [{ "package": "...", "version": "...", "license": "...", "risk": "none|low|medium|high|critical", "notes": "..." }],
    "privacyFindings": [{ "category": "gdpr|ccpa|coppa", "issue": "...", "risk": "...", "remediation": "..." }],
    "accessibilityFindings": [{ "wcagCriterion": "...", "issue": "...", "risk": "...", "remediation": "..." }],
    "overallRisk": "clean|low|medium|high|critical",
    "complianceScore": 0-100,
    "statusUpdate": "Your compliance summary — what's at risk, what needs immediate attention",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

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
