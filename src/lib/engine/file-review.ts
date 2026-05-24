// AION — File Diff Review System
// Intercepts file changes from agents before they're written to disk.
// Generates diffs, queues changes for review, supports auto-approval,
// and tracks review history.

import type { AgentRole, FileChange } from '@/lib/types/aion';

// ============================================================
// EXPORTED TYPES
// ============================================================

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: number;
}

export interface FileDiff {
  path: string;
  oldContent: string | null;
  newContent: string;
  linesAdded: number;
  linesRemoved: number;
  diff: DiffLine[];
  risk: 'low' | 'medium' | 'high';
}

export interface PendingFileChange extends FileChange {
  diff?: string;
  linesAdded: number;
  linesRemoved: number;
  risk: 'low' | 'medium' | 'high';
}

export interface FileChangeRequest {
  id: string;
  projectId: string;
  agentRole: AgentRole;
  files: PendingFileChange[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  autoApprovedReason?: string;
}

export interface ReviewDecision {
  requestIds: string[];
  action: 'approve' | 'reject';
  reviewer?: string;
  reason?: string;
}

export interface AutoApprovalRules {
  /** Agents whose changes are always auto-approved */
  trustedAgents: AgentRole[];
  /** Glob patterns for paths that auto-approve (e.g. "docs/**", "*.md") */
  autoApprovePaths: string[];
  /** Glob patterns for paths that always require manual review */
  requireManualReviewPaths: string[];
  /** Maximum number of changed lines before requiring manual review */
  maxAutoApproveLines: number;
  /** Whether auto-approval is enabled at all */
  enabled: boolean;
}

// ============================================================
// CONSTANTS & DEFAULTS
// ============================================================

const DEFAULT_AUTO_APPROVAL_RULES: AutoApprovalRules = {
  trustedAgents: [],
  autoApprovePaths: ['*.md', 'docs/**', 'README.md'],
  requireManualReviewPaths: [
    'src/app/api/**',
    'prisma/**',
    'middleware.ts',
    '**/auth/**',
    '**/security/**',
  ],
  maxAutoApproveLines: 500,
  enabled: true,
};

/** Paths whose changes are always high risk */
const HIGH_RISK_PATTERNS: RegExp[] = [
  /^src\/app\/api\//,           // API routes
  /^prisma\//,                   // Database schema
  /^middleware\.ts$/,            // Next.js middleware
  /\/auth\//,                    // Authentication files
  /\/security\//,                // Security middleware
  /\.env/,                       // Environment files
];

/** Paths whose changes are medium risk */
const MEDIUM_RISK_PATTERNS: RegExp[] = [
  /^src\/components\//,          // UI components
  /next\.config\./,              // Next.js config
  /tailwind\.config\./,          // Tailwind config
  /tsconfig\.json$/,             // TypeScript config
  /package\.json$/,              // Dependencies
  /^postcss\.config\./,          // PostCSS config
];

/** Paths whose changes are low risk */
const LOW_RISK_PATTERNS: RegExp[] = [
  /\.md$/,                       // Markdown / documentation
  /\.css$/,                      // CSS styling
  /^docs\//,                     // Docs directory
  /\.d\.ts$/,                    // Type declaration files
];

/** Domain directories each agent is expected to create files in */
const AGENT_DOMAIN_PATHS: Record<AgentRole, string[]> = {
  cto: ['src/lib/engine/', 'src/lib/types/'],
  frontend: ['src/components/', 'src/app/', 'src/hooks/', 'src/styles/'],
  backend: ['src/app/api/', 'src/lib/', 'src/services/'],
  qa: ['tests/', '__tests__/', 'src/__tests__/'],
  devops: ['docker/', '.github/', 'scripts/', 'infra/'],
  business: ['docs/', 'README.md'],
  research: ['docs/', 'research/'],
  security: ['src/lib/security/', 'middleware.ts'],
  design: ['src/components/', 'src/styles/', 'public/'],
  data: ['prisma/', 'src/lib/data/', 'src/lib/db/'],
  docs: ['docs/', '*.md', 'README.md'],
  analytics: ['src/lib/analytics/', 'src/lib/tracking/'],
  integration: ['src/lib/integrations/', 'src/services/'],
  performance: ['src/lib/performance/', 'src/lib/cache/'],
  compliance: ['src/lib/compliance/', 'docs/compliance/'],
};

// ============================================================
// UTILITY: GLOB MATCHING
// ============================================================

/**
 * Simple glob matcher supporting:
 *  - *  → any sequence of characters within a path segment
 *  - ** → any sequence of path segments
 */
function matchGlob(pattern: string, path: string): boolean {
  // Normalise both to forward slashes
  const normalisedPattern = pattern.replace(/\\/g, '/');
  const normalisedPath = path.replace(/\\/g, '/');

  // Convert glob to regex
  const regexStr = normalisedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex specials (except * and ?)
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalisedPath);
}

/**
 * Test a path against an array of regex patterns.
 */
function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

// ============================================================
// DIFF GENERATION (Myers-inspired, simplified)
// ============================================================

/**
 * Compute the longest common subsequence table for two string arrays.
 * Returns the DP table used to backtrack and produce the diff.
 */
function lcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack through the LCS table to produce DiffLines.
 */
function backtrackDiff(
  dp: number[][],
  oldLines: string[],
  newLines: string[],
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  // We build the diff in reverse then flip it
  const reversed: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Context line (unchanged)
      reversed.push({ type: 'context', content: oldLines[i - 1], lineNumber: i });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Added line
      reversed.push({ type: 'add', content: newLines[j - 1], lineNumber: j });
      j--;
    } else if (i > 0) {
      // Removed line
      reversed.push({ type: 'remove', content: oldLines[i - 1], lineNumber: i });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = reversed.length - 1; k >= 0; k--) {
    result.push(reversed[k]);
  }

  return result;
}

// ============================================================
// FILE REVIEW SYSTEM
// ============================================================

export class FileReviewSystem {
  /** All review requests keyed by id */
  private requests = new Map<string, FileChangeRequest>();

  /** Per-project auto-approval rules */
  private autoApprovalRules = new Map<string, AutoApprovalRules>();

  /** Counter for generating unique IDs */
  private idCounter = 0;

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Submit file changes for review.
   * Checks auto-approval rules and sets the request status accordingly.
   */
  submitForReview(
    projectId: string,
    agentRole: AgentRole,
    files: FileChange[],
  ): FileChangeRequest {
    const rules = this.getEffectiveRules(projectId);
    const id = this.generateId();

    // Build pending file changes with diffs and risk assessments
    const pendingFiles: PendingFileChange[] = files.map((file) => {
      const existingContent: string | null = this.getExistingContent(projectId, file);
      const diff = this.generateDiff(existingContent, file.content);
      const risk = this.assessRisk(file, existingContent);

      return {
        ...file,
        diff: this.formatDiffString(diff),
        linesAdded: diff.linesAdded,
        linesRemoved: diff.linesRemoved,
        risk,
      };
    });

    // Determine if the entire request can be auto-approved
    const autoApproval = this.checkAutoApproval(projectId, agentRole, pendingFiles, rules);

    const request: FileChangeRequest = {
      id,
      projectId,
      agentRole,
      files: pendingFiles,
      status: autoApproval.approved ? 'auto_approved' : 'pending',
      submittedAt: new Date().toISOString(),
      autoApprovedReason: autoApproval.approved ? autoApproval.reason : undefined,
    };

    this.requests.set(id, request);
    return request;
  }

  /**
   * Generate a structured diff between old and new content.
   * Returns a FileDiff with per-line information.
   */
  generateDiff(oldContent: string | null, newContent: string): FileDiff {
    const oldLines = oldContent === null ? [] : oldContent.split('\n');
    const newLines = newContent.split('\n');

    const dp = lcsTable(oldLines, newLines);
    const diffLines = backtrackDiff(dp, oldLines, newLines);

    const linesAdded = diffLines.filter((l) => l.type === 'add').length;
    const linesRemoved = diffLines.filter((l) => l.type === 'remove').length;

    // Determine path for risk — we don't have it here, so default to medium
    // The caller (submitForReview) will override risk at the file level.
    const risk = this.inferRiskFromLineCounts(linesAdded, linesRemoved);

    return {
      path: '', // Caller should set this
      oldContent,
      newContent,
      linesAdded,
      linesRemoved,
      diff: diffLines,
      risk,
    };
  }

  /**
   * Get all pending review requests for a project.
   */
  getPendingReviews(projectId: string): FileChangeRequest[] {
    const result: FileChangeRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.projectId === projectId && request.status === 'pending') {
        result.push(request);
      }
    }
    // Sort by submission time, oldest first
    return result.sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
  }

  /**
   * Get a specific review request by ID.
   * Re-generates full diffs for each file so the consumer gets complete info.
   */
  getReviewRequest(requestId: string): FileChangeRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Process a review decision — approve or reject one or more requests.
   */
  processReview(decision: ReviewDecision): FileChangeRequest[] {
    const processed: FileChangeRequest[] = [];
    const now = new Date().toISOString();

    for (const requestId of decision.requestIds) {
      const request = this.requests.get(requestId);
      if (!request) continue;
      if (request.status !== 'pending') continue; // Only pending requests can be reviewed

      request.status = decision.action === 'approve' ? 'approved' : 'rejected';
      request.reviewedAt = now;
      request.reviewedBy = decision.reviewer;

      processed.push(request);
    }

    return processed;
  }

  /**
   * Get the approved files from a request that are ready for writing to disk.
   * Returns null if the request is not in an approved state.
   */
  getApprovedFiles(requestId: string): FileChange[] | null {
    const request = this.requests.get(requestId);
    if (!request) return null;
    if (request.status !== 'approved' && request.status !== 'auto_approved') return null;

    // Return the original FileChange-compatible shape (path, content, action, description)
    return request.files.map((pf) => ({
      path: pf.path,
      content: pf.content,
      action: pf.action,
      description: pf.description,
    }));
  }

  /**
   * Get the review history for a project (non-pending reviews).
   */
  getReviewHistory(projectId: string, limit: number = 50): FileChangeRequest[] {
    const result: FileChangeRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.projectId === projectId && request.status !== 'pending') {
        result.push(request);
      }
    }
    // Sort by reviewed time, most recent first
    return result
      .sort((a, b) => {
        const aTime = a.reviewedAt ?? a.submittedAt;
        const bTime = b.reviewedAt ?? b.submittedAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })
      .slice(0, limit);
  }

  /**
   * Set auto-approval rules for a project.
   */
  setAutoApprovalRules(projectId: string, rules: Partial<AutoApprovalRules>): void {
    const current = this.getEffectiveRules(projectId);
    this.autoApprovalRules.set(projectId, { ...current, ...rules });
  }

  /**
   * Assess the risk level of a file change.
   */
  assessRisk(
    fileChange: FileChange,
    existingContent: string | null,
  ): 'low' | 'medium' | 'high' {
    const { path, action } = fileChange;

    // Deleting files is always high risk
    if (action === 'delete') {
      return 'high';
    }

    // Check high-risk patterns
    if (matchesAny(path, HIGH_RISK_PATTERNS)) {
      return 'high';
    }

    // Check low-risk patterns first
    if (matchesAny(path, LOW_RISK_PATTERNS)) {
      return 'low';
    }

    // Check medium-risk patterns
    if (matchesAny(path, MEDIUM_RISK_PATTERNS)) {
      return 'medium';
    }

    // Creating new files
    if (action === 'create' && existingContent === null) {
      // New non-critical files are low risk
      return 'low';
    }

    // Updating files — risk depends on size of change
    if (action === 'update' && existingContent !== null) {
      const oldLines = existingContent.split('\n').length;
      const newLines = fileChange.content.split('\n').length;
      const changedLines = Math.abs(newLines - oldLines);

      if (changedLines > 100) return 'high';
      if (changedLines > 30) return 'medium';
      return 'low';
    }

    // Default to medium for anything we can't categorize
    return 'medium';
  }

  // ----------------------------------------------------------
  // Private Helpers
  // ----------------------------------------------------------

  /**
   * Generate a unique ID for a review request.
   */
  private generateId(): string {
    this.idCounter += 1;
    const timestamp = Date.now().toString(36);
    const counter = this.idCounter.toString(36);
    return `fcr_${timestamp}_${counter}`;
  }

  /**
   * Get effective auto-approval rules for a project,
   * falling back to defaults if none are set.
   */
  private getEffectiveRules(projectId: string): AutoApprovalRules {
    return this.autoApprovalRules.get(projectId) ?? { ...DEFAULT_AUTO_APPROVAL_RULES };
  }

  /**
   * Simulate retrieving existing content for a file.
   * In a full integration this would read from the WorkspaceManager.
   * For now, returns null (treat all files as new) unless a previous
   * approved request wrote the file — we can infer from history.
   */
  private getExistingContent(_projectId: string, file: FileChange): string | null {
    // If the action is 'update', we assume the file exists.
    // Since we don't have direct filesystem access here, we return null
    // and the diff generator will treat it as a new-file scenario.
    // The integration layer should pre-populate oldContent before calling
    // submitForReview if it needs accurate diffs for updates.
    if (file.action === 'update') {
      // Indicate that we expect existing content but don't have it.
      // The diff will show all lines as "added" which is still useful.
      return null;
    }
    if (file.action === 'delete') {
      // For deletes we would need the old content to show a meaningful diff.
      // Return null — diff will be empty, which is acceptable.
      return null;
    }
    // 'create' — no existing content
    return null;
  }

  /**
   * Check whether a set of file changes qualifies for auto-approval.
   */
  private checkAutoApproval(
    projectId: string,
    agentRole: AgentRole,
    files: PendingFileChange[],
    rules: AutoApprovalRules,
  ): { approved: boolean; reason: string } {
    if (!rules.enabled) {
      return { approved: false, reason: 'Auto-approval is disabled' };
    }

    // Check if the agent is a trusted agent
    if (rules.trustedAgents.includes(agentRole)) {
      return { approved: true, reason: `Agent '${agentRole}' is in the trusted agents list` };
    }

    // Check total lines changed
    const totalLines = files.reduce((sum, f) => sum + f.linesAdded + f.linesRemoved, 0);
    if (totalLines > rules.maxAutoApproveLines) {
      return {
        approved: false,
        reason: `Total lines changed (${totalLines}) exceeds auto-approval threshold (${rules.maxAutoApproveLines})`,
      };
    }

    // Check if any file requires manual review
    for (const file of files) {
      // Check explicit manual review path patterns
      for (const pattern of rules.requireManualReviewPaths) {
        if (matchGlob(pattern, file.path)) {
          return {
            approved: false,
            reason: `File '${file.path}' matches manual-review pattern '${pattern}'`,
          };
        }
      }

      // High-risk files always require manual review
      if (file.risk === 'high') {
        return {
          approved: false,
          reason: `File '${file.path}' is classified as high risk`,
        };
      }

      // Deleting files always requires manual review
      if (file.action === 'delete') {
        return {
          approved: false,
          reason: `File '${file.path}' is being deleted — manual review required`,
        };
      }
    }

    // Check if all files match auto-approve path patterns or agent domain
    const allAutoApprovable = files.every((file) => {
      // Check auto-approve path patterns
      const matchesAutoPath = rules.autoApprovePaths.some((pattern) =>
        matchGlob(pattern, file.path),
      );

      if (matchesAutoPath) return true;

      // Check if agent is creating in its domain
      if (file.action === 'create') {
        const domainPaths = AGENT_DOMAIN_PATHS[agentRole] ?? [];
        const inDomain = domainPaths.some((pattern) => matchGlob(pattern, file.path));
        if (inDomain && file.risk !== 'high') return true;
      }

      // Documentation agent gets auto-approve for md files
      if (agentRole === 'docs' && (file.path.endsWith('.md') || file.path.startsWith('docs/'))) {
        return true;
      }

      return false;
    });

    if (allAutoApprovable) {
      return { approved: true, reason: 'All files match auto-approval criteria' };
    }

    // If we get here, some files don't match auto-approve patterns
    // and none triggered a hard "must review" rule.
    // Default: require manual review
    return { approved: false, reason: 'Some files do not match auto-approval patterns' };
  }

  /**
   * Format a FileDiff into a unified-diff-style string.
   */
  private formatDiffString(diff: FileDiff): string {
    const lines: string[] = [];
    lines.push(`--- a/${diff.path || 'unknown'}`);
    lines.push(`+++ b/${diff.path || 'unknown'}`);

    for (const dl of diff.diff) {
      switch (dl.type) {
        case 'add':
          lines.push(`+${dl.content}`);
          break;
        case 'remove':
          lines.push(`-${dl.content}`);
          break;
        case 'context':
          lines.push(` ${dl.content}`);
          break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Infer a risk level from line counts alone (used by generateDiff
   * which doesn't have path information).
   */
  private inferRiskFromLineCounts(
    linesAdded: number,
    linesRemoved: number,
  ): 'low' | 'medium' | 'high' {
    const total = linesAdded + linesRemoved;
    if (total > 500) return 'high';
    if (total > 100) return 'medium';
    return 'low';
  }

  // ----------------------------------------------------------
  // Extended API for integration
  // ----------------------------------------------------------

  /**
   * Get a FileDiff object for a specific file within a request.
   * Useful for displaying a rich diff view in the UI.
   */
  getFileDiff(requestId: string, filePath: string): FileDiff | null {
    const request = this.requests.get(requestId);
    if (!request) return null;

    const file = request.files.find((f) => f.path === filePath);
    if (!file) return null;

    // Re-derive the diff (we stored the string version, but we can
    // reconstruct the structured version from oldContent and newContent)
    // Since we may not have oldContent, we parse from the diff string
    const diffLines = this.parseDiffString(file.diff ?? '');
    const oldContent = this.reconstructOldContent(diffLines);

    return {
      path: file.path,
      oldContent,
      newContent: file.content,
      linesAdded: file.linesAdded,
      linesRemoved: file.linesRemoved,
      diff: diffLines,
      risk: file.risk,
    };
  }

  /**
   * Parse a unified-diff-style string back into structured DiffLines.
   */
  private parseDiffString(diffStr: string): DiffLine[] {
    if (!diffStr) return [];

    const lines = diffStr.split('\n');
    const result: DiffLine[] = [];
    let lineNumber = 0;

    for (const line of lines) {
      // Skip header lines
      if (line.startsWith('---') || line.startsWith('+++')) continue;

      lineNumber++;
      if (line.startsWith('+')) {
        result.push({ type: 'add', content: line.slice(1), lineNumber });
      } else if (line.startsWith('-')) {
        result.push({ type: 'remove', content: line.slice(1), lineNumber });
      } else if (line.startsWith(' ')) {
        result.push({ type: 'context', content: line.slice(1), lineNumber });
      }
    }

    return result;
  }

  /**
   * Reconstruct old content from diff lines (context + removed lines).
   */
  private reconstructOldContent(diffLines: DiffLine[]): string | null {
    if (diffLines.length === 0) return null;

    const oldLines: string[] = [];
    for (const dl of diffLines) {
      if (dl.type === 'context' || dl.type === 'remove') {
        oldLines.push(dl.content);
      }
    }

    if (oldLines.length === 0) return null;
    return oldLines.join('\n');
  }

  /**
   * Supply the existing content for a file so that accurate diffs
   * can be generated. Call this before submitForReview for 'update'
   * actions if you have the old content available.
   */
  private existingContentCache = new Map<string, string>();

  /**
   * Pre-register existing file content so the diff generator
   * can produce accurate results for updates.
   */
  registerExistingContent(projectId: string, filePath: string, content: string): void {
    this.existingContentCache.set(`${projectId}:${filePath}`, content);
  }

  /**
   * Override of getExistingContent that checks the cache.
   */
  private getExistingContentCached(projectId: string, file: FileChange): string | null {
    if (file.action === 'create') return null;

    const cached = this.existingContentCache.get(`${projectId}:${file.path}`);
    if (cached !== undefined) return cached;

    // For deletes and updates without cached content, return null
    return null;
  }

  /**
   * Extended version of submitForReview that uses cached existing content
   * for more accurate diffs.
   */
  submitForReviewWithCache(
    projectId: string,
    agentRole: AgentRole,
    files: FileChange[],
  ): FileChangeRequest {
    const rules = this.getEffectiveRules(projectId);
    const id = this.generateId();

    const pendingFiles: PendingFileChange[] = files.map((file) => {
      const existingContent = this.getExistingContentCached(projectId, file);
      const diff = this.generateDiff(existingContent, file.action === 'delete' ? '' : file.content);
      const risk = this.assessRisk(file, existingContent);

      // Update the cache with new content if it's a create or update
      if (file.action === 'create' || file.action === 'update') {
        this.registerExistingContent(projectId, file.path, file.content);
      }

      return {
        ...file,
        diff: this.formatDiffString({ ...diff, path: file.path }),
        linesAdded: diff.linesAdded,
        linesRemoved: diff.linesRemoved,
        risk,
      };
    });

    const autoApproval = this.checkAutoApproval(projectId, agentRole, pendingFiles, rules);

    const request: FileChangeRequest = {
      id,
      projectId,
      agentRole,
      files: pendingFiles,
      status: autoApproval.approved ? 'auto_approved' : 'pending',
      submittedAt: new Date().toISOString(),
      autoApprovedReason: autoApproval.approved ? autoApproval.reason : undefined,
    };

    this.requests.set(id, request);
    return request;
  }

  /**
   * Get statistics about reviews for a project.
   */
  getReviewStats(projectId: string): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    autoApproved: number;
    averageLinesPerReview: number;
  } {
    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let autoApproved = 0;
    let totalLines = 0;

    for (const request of this.requests.values()) {
      if (request.projectId !== projectId) continue;

      total++;
      const lines = request.files.reduce(
        (sum, f) => sum + f.linesAdded + f.linesRemoved,
        0,
      );
      totalLines += lines;

      switch (request.status) {
        case 'pending':
          pending++;
          break;
        case 'approved':
          approved++;
          break;
        case 'rejected':
          rejected++;
          break;
        case 'auto_approved':
          autoApproved++;
          break;
      }
    }

    return {
      total,
      pending,
      approved,
      rejected,
      autoApproved,
      averageLinesPerReview: total > 0 ? Math.round(totalLines / total) : 0,
    };
  }

  /**
   * Clear all review data for a project (useful for cleanup / tests).
   */
  clearProjectData(projectId: string): void {
    for (const [id, request] of this.requests.entries()) {
      if (request.projectId === projectId) {
        this.requests.delete(id);
      }
    }
    this.autoApprovalRules.delete(projectId);

    // Clear existing content cache for this project
    for (const key of this.existingContentCache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.existingContentCache.delete(key);
      }
    }
  }
}

// Singleton
export const fileReview = new FileReviewSystem();
