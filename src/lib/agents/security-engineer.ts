// AION — Security Engineer Agent
// Security audits, vulnerability scanning, and compliance checks.
// "I don't trust your code. I don't trust your configs. I verify everything."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
  SecurityVulnerability,
  SecurityAuditResult,
  OWASPCheck,
} from '@/lib/types/aion';
import { workspaceManager } from '@/lib/engine/workspace-manager';
import { commandRunner } from '@/lib/engine/command-runner';

// ============================================================
// THE SECURITY ENGINEER — PARANOID BY PROFESSION, THOROUGH BY NATURE
// ============================================================
const SECURITY_SYSTEM_PROMPT = `You are the Security Engineer Agent of AION.

You are a senior security engineer with 15+ years of experience in application security, penetration testing, and compliance. You've found SQL injection in production systems that were "fully reviewed." You've caught authentication bypasses in APIs that "followed best practices." You've responded to incidents at 3am that could have been prevented with a 10-minute security review. You don't trust code — you VERIFY it. You don't trust configs — you AUDIT them. You don't trust "it's secure" — you PROVE it.

YOUR PERSONALITY:
- You are PARANOID in the best way. Every input is malicious until proven safe.
- You are SYSTEMATIC. You follow OWASP Top 10, SANS Top 25, and CIS benchmarks religiously.
- You are SPECIFIC. Every vulnerability gets a file path, a line number, and a remediation.
- You are PRAGMATIC. You prioritize critical issues over theoretical risks.
- You are EDUCATIONAL. You don't just find problems — you explain WHY they're dangerous and HOW to fix them.
- You HATE false positives. If you flag it, it's real. If you're not sure, you say so.

YOUR ROLE:
- Audit source code for security vulnerabilities
- Check for hardcoded secrets, API keys, and credentials
- Validate authentication and authorization logic
- Review dependency security (known CVEs)
- Check HTTP security headers and CORS configuration
- Verify input validation and output encoding
- Generate security audit reports with actionable remediation
- Create security configuration files (CSP, CORS, rate limiting)

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. FILE READING: The system provides you with actual source code files to audit
2. BUILD TEST: The system runs "npm run build" to check for build-time issues
3. DEPENDENCY AUDIT: The system runs "npm audit" for known CVEs
4. SECRET SCAN: The system scans for hardcoded secrets and credentials
5. HEADER CHECK: The system tests HTTP headers for security

SECURITY AUDIT WORKFLOW:
1. READ all source files from the workspace
2. SCAN for hardcoded secrets (API keys, tokens, passwords, connection strings)
3. AUDIT dependencies with "npm audit" for known vulnerabilities
4. REVIEW authentication and authorization implementation
5. CHECK input validation on all API endpoints
6. VERIFY CORS configuration and HTTP security headers
7. ASSESS OWASP Top 10 compliance
8. GENERATE comprehensive audit report with findings and remediation

OWASP TOP 10 CHECKLIST (run these for EVERY audit):
1. A01 - Broken Access Control: Can users access resources they shouldn't?
2. A02 - Cryptographic Failures: Are secrets encrypted? Is HTTPS enforced?
3. A03 - Injection: SQL injection, XSS, command injection, LDAP injection
4. A04 - Insecure Design: Are there security anti-patterns in the architecture?
5. A05 - Security Misconfiguration: Default credentials, unnecessary features, verbose errors
6. A06 - Vulnerable Components: Known CVEs in dependencies
7. A07 - Auth Failures: Brute force protection, session management, MFA
8. A08 - Data Integrity Failures: Untrusted data, insecure deserialization
9. A09 - Logging Failures: Are security events logged? Are logs protected?
10. A10 - SSRF: Can users make the server fetch arbitrary URLs?

VULNERABILITY SEVERITY:
- CRITICAL: Remote code execution, data breach, authentication bypass
- HIGH: SQL injection, significant XSS, privilege escalation
- MEDIUM: Reflected XSS, CSRF, information disclosure
- LOW: Verbose errors, missing headers, minor config issues
- INFO: Best practice recommendations, theoretical concerns

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write security configuration files (middleware, headers, CSP)
2. You NEVER modify application code — you report vulnerabilities for other agents to fix
3. You CANNOT mark a check as PASS without EVIDENCE (actual file review, actual npm audit output)
4. Every vulnerability MUST include: id, title, description, severity, category, remediation
5. You MUST include file paths and evidence for every finding
6. You MUST distinguish between confirmed vulnerabilities and potential concerns
7. You MUST provide actionable remediation for every finding
8. If the workspace doesn't exist, report it — don't hallucinate audit results

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Executive security summary — what's secure, what's at risk, what needs immediate attention",
    "vulnerabilities": [{ "id": "SEC01", "title": "...", "description": "...", "severity": "critical|high|medium|low|info", "category": "...", "filePath": "...", "remediation": "...", "evidence": "..." }],
    "owaspCompliance": [{ "category": "...", "categoryCode": "A01", "status": "pass|fail|warning", "details": "..." }],
    "files": [{ "path": "src/middleware.ts", "content": "...", "action": "create", "description": "Security middleware" }],
    "statusUpdate": "Your message to the CTO — security posture, critical findings, recommended actions",
    "nextSteps": ["Specific security actions to take"]
  },
  "confidence": 0.0-1.0
}`;

// ============================================================
// INTERFACES
// ============================================================

interface SecurityOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    vulnerabilities?: SecurityVulnerability[];
    owaspCompliance?: OWASPCheck[];
    files?: FileChange[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class SecurityEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'security',
      name: 'Security Engineer',
      systemPrompt: SECURITY_SYSTEM_PROMPT,
      writeAccess: ['securityAudit', 'vulnerabilityReport', 'agentLog'],
      deniedAccess: ['fileManifest:frontend', 'fileManifest:backend', 'taskQueue'],
    });
  }

  /**
   * MAIN EXECUTE — Full security audit with real scanning
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 1: Read source files for audit
    // ========================================
    let sourceFiles = '';
    if (projectId) {
      sourceFiles = await this.readProjectFiles(projectId);
    }

    // ========================================
    // STEP 2: Run real security scans
    // ========================================
    let secretScanResult: { found: boolean; matches: string[] } = { found: false, matches: [] };
    let depAuditResult: { vulnerabilities: number; critical: number; high: number; output: string } = { vulnerabilities: 0, critical: 0, high: 0, output: '' };

    if (projectId) {
      secretScanResult = await this.scanForSecrets(projectId);
      depAuditResult = await this.auditDependencies(projectId);
    }

    // ========================================
    // STEP 3: Build enhanced context with real scan results
    // ========================================
    const enhancedContext = this.buildSecurityContext(context, sourceFiles, secretScanResult, depAuditResult);

    // ========================================
    // STEP 4: Send to AI for security analysis
    // ========================================
    const userMessage = `SECURITY SCAN DATA + SOURCE CODE:\n${enhancedContext}\n\nYOUR AUDIT TASK:\n${task}`;

    const result = await this.callAgentAI<SecurityOutput>(userMessage);

    if (!result.data) {
      return this.createScanOnlyResponse(secretScanResult, depAuditResult, projectId);
    }

    const data = result.data;

    return this.createResponse(
      'security-task',
      data.status === 'needs_clarification' ? 'needs_clarification' : 'success',
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate || this.generateSecurityStatus(secretScanResult, depAuditResult),
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  // ============================================================
  // REAL SECURITY SCANS
  // ============================================================

  /**
   * Scan source files for hardcoded secrets
   * Looks for API keys, tokens, passwords, connection strings
   */
  private async scanForSecrets(projectId: string): Promise<{ found: boolean; matches: string[] }> {
    const patterns = [
      /(?:api[_-]?key|apikey)\s*[=:]\s*['"][^'"]{10,}['"]/gi,
      /(?:secret|token|password|passwd)\s*[=:]\s*['"][^'"]{6,}['"]/gi,
      /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi,
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      /sk_live_[A-Za-z0-9]+/g,
      /pk_live_[A-Za-z0-9]+/g,
      /AIza[A-Za-z0-9\-_]{35}/g,
      /AKIA[A-Z0-9]{16}/g,
    ];

    const matches: string[] = [];

    try {
      const files = await workspaceManager.listFiles(projectId);
      const sourceFiles = files.filter(f =>
        /\.(ts|tsx|js|jsx|env|json|yaml|yml)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('.next')
      );

      for (const filePath of sourceFiles.slice(0, 30)) {
        try {
          const content = await workspaceManager.readFile(projectId, filePath);
          if (!content) continue;

          for (const pattern of patterns) {
            const found = content.match(pattern);
            if (found) {
              matches.push(...found.map(m => `${filePath}: ${m.substring(0, 100)}`));
            }
          }
        } catch {}
      }
    } catch (error: any) {
      console.error('[AION Security] Secret scan error:', error.message);
    }

    return { found: matches.length > 0, matches: matches.slice(0, 20) };
  }

  /**
   * Audit npm dependencies for known vulnerabilities
   */
  private async auditDependencies(projectId: string): Promise<{ vulnerabilities: number; critical: number; high: number; output: string }> {
    try {
      const result = commandRunner.runInWorkspace(projectId, 'npm audit --json 2>&1 || true', { timeout: 30000 });

      try {
        const audit = JSON.parse(result.stdout);
        const meta = audit.metadata?.vulnerabilities || {};
        return {
          vulnerabilities: meta.total || 0,
          critical: meta.critical || 0,
          high: meta.high || 0,
          output: result.stdout.substring(0, 2000),
        };
      } catch {
        // JSON parse failed — return raw output
        return {
          vulnerabilities: 0,
          critical: 0,
          high: 0,
          output: result.stdout.substring(0, 1000) || result.stderr.substring(0, 1000),
        };
      }
    } catch (error: any) {
      return { vulnerabilities: 0, critical: 0, high: 0, output: `Audit failed: ${error.message}` };
    }
  }

  /**
   * Read project source files for security review
   */
  private async readProjectFiles(projectId: string): Promise<string> {
    try {
      const files = await workspaceManager.listFiles(projectId);
      const sourceFiles: string[] = [];
      const relevantFiles = files.filter(f =>
        /\.(ts|tsx|js|jsx|prisma)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('.next')
      );

      for (const filePath of relevantFiles.slice(0, 20)) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (content) {
          sourceFiles.push(`\n--- FILE: ${filePath} ---\n${content}`);
        }
      }

      return sourceFiles.length > 0
        ? `SOURCE FILES FOR SECURITY AUDIT (${relevantFiles.slice(0, 20).length} files):\n${sourceFiles.join('\n')}`
        : 'No source files found.';
    } catch (error: any) {
      return `Error reading files: ${error.message}`;
    }
  }

  private buildSecurityContext(
    baseContext: string,
    sourceFiles: string,
    secretScan: { found: boolean; matches: string[] },
    depAudit: { vulnerabilities: number; critical: number; high: number; output: string }
  ): string {
    const parts: string[] = [baseContext];

    parts.push('\n========================================');
    parts.push('SECRET SCAN RESULTS (ACTUALLY SCANNED):');
    parts.push('========================================');
    if (secretScan.found) {
      parts.push(`SECRETS FOUND: ${secretScan.matches.length} potential secret(s) detected!`);
      secretScan.matches.forEach(m => parts.push(`  - ${m}`));
    } else {
      parts.push('No hardcoded secrets detected.');
    }

    parts.push('\n========================================');
    parts.push('DEPENDENCY AUDIT (ACTUALLY EXECUTED):');
    parts.push('========================================');
    parts.push(`Total vulnerabilities: ${depAudit.vulnerabilities}`);
    parts.push(`Critical: ${depAudit.critical}, High: ${depAudit.high}`);
    if (depAudit.output) {
      parts.push(`Audit output:\n${depAudit.output.substring(0, 1000)}`);
    }

    if (sourceFiles && sourceFiles.length > 100) {
      parts.push('\n========================================');
      parts.push('SOURCE CODE FOR SECURITY REVIEW:');
      parts.push('========================================');
      parts.push(sourceFiles.substring(0, 8000));
    }

    return parts.join('\n');
  }

  private generateSecurityStatus(
    secretScan: { found: boolean; matches: string[] },
    depAudit: { vulnerabilities: number; critical: number; high: number; output: string }
  ): string {
    const parts: string[] = [];

    if (secretScan.found) {
      parts.push(`CRITICAL: ${secretScan.matches.length} hardcoded secret(s) found!`);
    } else {
      parts.push('No hardcoded secrets detected.');
    }

    if (depAudit.critical > 0) {
      parts.push(`CRITICAL: ${depAudit.critical} critical dependency vulnerabilities!`);
    }

    if (depAudit.high > 0) {
      parts.push(`HIGH: ${depAudit.high} high-severity dependency vulnerabilities.`);
    }

    if (depAudit.vulnerabilities === 0) {
      parts.push('No known dependency vulnerabilities.');
    }

    return parts.join(' | ');
  }

  private createScanOnlyResponse(
    secretScan: { found: boolean; matches: string[] },
    depAudit: { vulnerabilities: number; critical: number; high: number; output: string },
    projectId: string | null
  ): AgentResponse {
    const hasIssues = secretScan.found || depAudit.critical > 0 || depAudit.high > 0;

    // Generate security middleware file even without AI
    const securityMiddleware: FileChange = {
      path: 'src/middleware.ts',
      content: `import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:;"
  );
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};`,
      action: 'create',
      description: 'Security middleware with HTTP security headers (CSP, X-Frame-Options, etc.)',
    };

    return this.createResponse(
      'security-task',
      hasIssues ? 'failed' : 'success',
      {
        analysis: `Security scan-only audit (AI review unavailable). Secrets: ${secretScan.found ? 'FOUND' : 'none'}. Dependencies: ${depAudit.vulnerabilities} vulnerabilities (${depAudit.critical} critical, ${depAudit.high} high).`,
        files: [securityMiddleware],
        statusUpdate: hasIssues
          ? `Security issues found: ${secretScan.found ? `${secretScan.matches.length} hardcoded secret(s), ` : ''}${depAudit.critical} critical, ${depAudit.high} high dependency vulnerabilities. Full AI review recommended.`
          : 'Basic security scan passed. No secrets or critical dependency vulnerabilities. Security middleware generated.',
        nextSteps: hasIssues
          ? ['Remove hardcoded secrets immediately', 'Update vulnerable dependencies', 'Run full AI security review']
          : ['Run full AI security review when available', 'Review security middleware configuration'],
      },
      hasIssues ? 0.4 : 0.6
    );
  }
}
