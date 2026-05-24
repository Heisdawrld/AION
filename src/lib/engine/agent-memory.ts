// AION — Agent Memory System
// Allows agents to learn from past tasks, remember patterns, and improve over time.
// This is the CROSS-PROJECT INTELLIGENCE LAYER — knowledge persists across all projects.

import { db } from '@/lib/db';
import type { AgentRole } from '@/lib/types/aion';

// ============================================================
// EXPORTED MEMORY TYPES
// ============================================================

export interface AgentMemory {
  id: string;
  agentRole: string;
  category: 'task_pattern' | 'error_resolution' | 'project_context' | 'general';
  pattern: string;
  resolution: string | null;
  confidence: number;
  projectId?: string | null;
  createdAt: Date;
  expiresAt?: Date | null;
}

export interface TaskPattern {
  agentRole: string;
  taskType: string;
  approach: string;
  outcome: 'success' | 'failure' | 'partial';
  confidence: number;
  frequency: number;
}

export interface ErrorResolution {
  agentRole: string;
  errorPattern: string;
  resolution: string;
  workedCount: number;
  failedCount: number;
}

export interface ProjectContext {
  projectId: string;
  key: string;
  value: string;
  updatedBy: string;
  updatedAt: Date;
}

// ============================================================
// INTERNAL TYPES
// ============================================================

interface MemoryRecallResult {
  memory: AgentMemory;
  relevanceScore: number;
}

interface AgentMemoryStats {
  totalMemories: number;
  taskPatternsStored: number;
  errorResolutionsStored: number;
  projectContextsStored: number;
  successfulPatterns: number;
  failedPatterns: number;
  averageConfidence: number;
  mostCommonTaskTypes: { taskType: string; count: number }[];
  topErrorPatterns: { errorPattern: string; workedCount: number }[];
}

// ============================================================
// CONSTANTS
// ============================================================

/** Task patterns expire after 30 days */
const TASK_PATTERN_EXPIRY_DAYS = 30;

/** Minimum token overlap to consider a pattern similar */
const MIN_SIMILARITY_SCORE = 0.15;

/** Maximum memories to return in a single recall */
const DEFAULT_RECALL_LIMIT = 10;

// ============================================================
// UTILITY: Simple token-based text similarity
// ============================================================

/**
 * Tokenize a string into lowercase words for comparison.
 * Strips common punctuation and splits on whitespace.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2); // Ignore very short tokens
}

/**
 * Calculate Jaccard-like similarity between two strings based on token overlap.
 * Returns a value between 0 (no overlap) and 1 (identical tokens).
 */
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  Array.from(tokensA).forEach(token => {
    if (tokensB.has(token)) intersection++;
  });

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract the most significant keywords from a text for LIKE-query matching.
 * Returns the top N tokens sorted by length (longer tokens are more specific).
 */
function extractKeywords(text: string, maxKeywords: number = 3): string[] {
  const tokens = tokenize(text);
  // Sort by length descending (longer = more specific), then take top N
  return [...tokens]
    .sort((a, b) => b.length - a.length)
    .slice(0, maxKeywords);
}

// ============================================================
// AGENT MEMORY STORE
// ============================================================

export class AgentMemoryStore {
  // ============================================================
  // CORE MEMORY OPERATIONS
  // ============================================================

  /**
   * Store a new memory entry.
   * This is the generic method for storing any type of agent memory.
   */
  async storeMemory(memory: Omit<AgentMemory, 'id' | 'createdAt'>): Promise<AgentMemory> {
    // Determine expiry based on category
    let expiresAt: Date | null = memory.expiresAt ?? null;

    if (memory.category === 'task_pattern' && !expiresAt) {
      // Task patterns auto-expire after 30 days
      expiresAt = new Date(Date.now() + TASK_PATTERN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    }
    // Error resolutions are permanent (no expiry)
    // Project context is permanent (managed separately)
    // General memories use provided expiry or default 30 days
    if (memory.category === 'general' && !expiresAt) {
      expiresAt = new Date(Date.now() + TASK_PATTERN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    }

    const entry = await db.agentMemoryEntry.create({
      data: {
        agentRole: memory.agentRole,
        category: memory.category,
        pattern: memory.pattern,
        resolution: memory.resolution,
        confidence: memory.confidence,
        projectId: memory.projectId ?? null,
        expiresAt,
      },
    });

    return this.mapEntryToMemory(entry);
  }

  /**
   * Retrieve relevant memories for an agent based on a query.
   * Uses token-based similarity matching to find the most relevant memories.
   * Only returns non-expired memories.
   */
  async recallMemories(
    agentRole: string,
    query: string,
    limit: number = DEFAULT_RECALL_LIMIT,
  ): Promise<AgentMemory[]> {
    // First, fetch candidate memories for this agent role
    const candidates = await db.agentMemoryEntry.findMany({
      where: {
        agentRole,
        // Only return non-expired memories
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { confidence: 'desc' },
      take: 200, // Pre-filter to top 200 by confidence before similarity scoring
    });

    // Score each candidate for relevance
    const scored: MemoryRecallResult[] = candidates.map(entry => {
      const memory = this.mapEntryToMemory(entry);
      const patternScore = tokenSimilarity(query, memory.pattern);
      const resolutionScore = memory.resolution
        ? tokenSimilarity(query, memory.resolution) * 0.5
        : 0;
      const relevanceScore = Math.max(patternScore, resolutionScore);
      return { memory, relevanceScore };
    });

    // Filter by minimum similarity and sort by relevance
    return scored
      .filter(result => result.relevanceScore >= MIN_SIMILARITY_SCORE)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit)
      .map(result => result.memory);
  }

  // ============================================================
  // TASK PATTERN OPERATIONS
  // ============================================================

  /**
   * Remember a successful (or failed) task approach.
   * If a similar pattern already exists for this agent+taskType+approach,
   * increment its frequency instead of creating a duplicate.
   */
  async storeTaskPattern(pattern: Omit<TaskPattern, 'frequency'> & { projectId?: string }): Promise<TaskPattern> {
    // Check if a very similar pattern already exists
    const existing = await db.agentTaskPattern.findFirst({
      where: {
        agentRole: pattern.agentRole,
        taskType: pattern.taskType,
        approach: pattern.approach,
        outcome: pattern.outcome,
      },
    });

    if (existing) {
      // Increment frequency and update confidence (running average)
      const newFrequency = existing.frequency + 1;
      const newConfidence = (existing.confidence * existing.frequency + pattern.confidence) / newFrequency;

      const updated = await db.agentTaskPattern.update({
        where: { id: existing.id },
        data: {
          frequency: newFrequency,
          confidence: newConfidence,
          // Reset expiry on update
          expiresAt: new Date(Date.now() + TASK_PATTERN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      return this.mapTaskPattern(updated);
    }

    // Create new task pattern
    const entry = await db.agentTaskPattern.create({
      data: {
        agentRole: pattern.agentRole,
        taskType: pattern.taskType,
        approach: pattern.approach,
        outcome: pattern.outcome,
        confidence: pattern.confidence,
        frequency: 1,
        projectId: pattern.projectId ?? null,
        expiresAt: new Date(Date.now() + TASK_PATTERN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    // Also store as a general memory for cross-category recall
    await this.storeMemory({
      agentRole: pattern.agentRole,
      category: 'task_pattern',
      pattern: `${pattern.taskType}: ${pattern.approach}`,
      resolution: `Outcome: ${pattern.outcome}`,
      confidence: pattern.confidence,
      projectId: pattern.projectId,
      expiresAt: new Date(Date.now() + TASK_PATTERN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    });

    return this.mapTaskPattern(entry);
  }

  /**
   * Find similar past tasks for an agent based on a task description.
   * Uses token overlap to identify relevant patterns.
   * Returns patterns sorted by a combination of similarity and confidence.
   */
  async findSimilarPatterns(
    agentRole: string,
    taskDescription: string,
    limit: number = 5,
  ): Promise<TaskPattern[]> {
    // Use keyword extraction for a broad LIKE-based query
    const keywords = extractKeywords(taskDescription, 4);

    if (keywords.length === 0) {
      // Fallback: return most confident recent patterns
      const recent = await db.agentTaskPattern.findMany({
        where: {
          agentRole,
          outcome: 'success',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: [{ confidence: 'desc' }, { frequency: 'desc' }],
        take: limit,
      });
      return recent.map(this.mapTaskPattern);
    }

    // Build OR conditions for each keyword matching against taskType or approach
    const keywordConditions = keywords.map(keyword => [
      { taskType: { contains: keyword } },
      { approach: { contains: keyword } },
    ]).flat();

    const candidates = await db.agentTaskPattern.findMany({
      where: {
        agentRole,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
          {
            OR: keywordConditions,
          },
        ],
      },
      take: 50,
    });

    // Score by similarity
    const scored = candidates
      .map(entry => {
        const pattern = this.mapTaskPattern(entry);
        const typeScore = tokenSimilarity(taskDescription, pattern.taskType);
        const approachScore = tokenSimilarity(taskDescription, pattern.approach);
        const similarity = Math.max(typeScore, approachScore);
        // Boost by confidence and frequency
        const boostedScore = similarity * 0.6 + pattern.confidence * 0.3 + Math.min(pattern.frequency / 10, 1) * 0.1;
        return { pattern, score: boostedScore };
      })
      .filter(item => item.score >= MIN_SIMILARITY_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(item => item.pattern);
  }

  // ============================================================
  // ERROR RESOLUTION OPERATIONS
  // ============================================================

  /**
   * Remember how an error was fixed.
   * If a very similar error pattern already exists, increment worked/failed counts
   * instead of creating a duplicate.
   */
  async storeErrorResolution(resolution: Omit<ErrorResolution, 'workedCount' | 'failedCount'> & { worked?: boolean; projectId?: string }): Promise<ErrorResolution> {
    // Check for an existing resolution with a similar error pattern
    const existing = await db.agentErrorResolution.findFirst({
      where: {
        agentRole: resolution.agentRole,
        errorPattern: resolution.errorPattern,
        resolution: resolution.resolution,
      },
    });

    const worked = resolution.worked !== false; // Default to true if not specified

    if (existing) {
      const updated = await db.agentErrorResolution.update({
        where: { id: existing.id },
        data: {
          workedCount: worked ? { increment: 1 } : undefined,
          failedCount: !worked ? { increment: 1 } : undefined,
        },
      });

      return this.mapErrorResolution(updated);
    }

    // Create new error resolution
    const entry = await db.agentErrorResolution.create({
      data: {
        agentRole: resolution.agentRole,
        errorPattern: resolution.errorPattern,
        resolution: resolution.resolution,
        workedCount: worked ? 1 : 0,
        failedCount: worked ? 0 : 1,
        projectId: resolution.projectId ?? null,
      },
    });

    // Also store as a permanent memory entry (error resolutions never expire)
    await this.storeMemory({
      agentRole: resolution.agentRole,
      category: 'error_resolution',
      pattern: resolution.errorPattern,
      resolution: resolution.resolution,
      confidence: worked ? 0.8 : 0.3,
      projectId: resolution.projectId,
      expiresAt: null, // Permanent
    });

    return this.mapErrorResolution(entry);
  }

  /**
   * Find how similar errors were resolved before.
   * Uses token-based matching to find the most relevant past resolutions.
   * Prioritizes resolutions that worked more often.
   */
  async findErrorResolution(
    agentRole: string,
    errorDescription: string,
    limit: number = 3,
  ): Promise<ErrorResolution[]> {
    // Use keyword extraction for broad matching
    const keywords = extractKeywords(errorDescription, 4);

    if (keywords.length === 0) {
      // Fallback: return most successful resolutions for this agent
      const topResolutions = await db.agentErrorResolution.findMany({
        where: { agentRole },
        orderBy: [{ workedCount: 'desc' }],
        take: limit,
      });
      return topResolutions.map(this.mapErrorResolution);
    }

    // Build OR conditions for keyword matching against errorPattern
    const keywordConditions = keywords.map(keyword => ({
      errorPattern: { contains: keyword },
    }));

    const candidates = await db.agentErrorResolution.findMany({
      where: {
        agentRole,
        OR: keywordConditions,
      },
      take: 30,
    });

    // Score by similarity and effectiveness
    const scored = candidates
      .map(entry => {
        const resolution = this.mapErrorResolution(entry);
        const similarity = tokenSimilarity(errorDescription, resolution.errorPattern);
        const totalAttempts = resolution.workedCount + resolution.failedCount;
        const successRate = totalAttempts > 0 ? resolution.workedCount / totalAttempts : 0;
        const effectivenessScore = similarity * 0.5 + successRate * 0.4 + Math.min(totalAttempts / 5, 1) * 0.1;
        return { resolution, score: effectivenessScore };
      })
      .filter(item => item.score >= MIN_SIMILARITY_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(item => item.resolution);
  }

  // ============================================================
  // PROJECT CONTEXT OPERATIONS
  // ============================================================

  /**
   * Store project-specific context (tech stack decisions, patterns used, etc.).
   * Uses upsert so the same key always holds the latest value.
   */
  async storeProjectContext(
    projectId: string,
    key: string,
    value: string,
    updatedBy: string,
  ): Promise<ProjectContext> {
    const entry = await db.agentProjectContext.upsert({
      where: {
        projectId_key: { projectId, key },
      },
      create: {
        projectId,
        key,
        value,
        updatedBy,
      },
      update: {
        value,
        updatedBy,
      },
    });

    return this.mapProjectContext(entry);
  }

  /**
   * Retrieve project context. If a key is provided, returns that specific entry.
   * If no key is provided, returns all context for the project.
   */
  async getProjectContext(projectId: string, key?: string): Promise<ProjectContext[]> {
    if (key) {
      const entry = await db.agentProjectContext.findUnique({
        where: {
          projectId_key: { projectId, key },
        },
      });
      return entry ? [this.mapProjectContext(entry)] : [];
    }

    const entries = await db.agentProjectContext.findMany({
      where: { projectId },
      orderBy: { key: 'asc' },
    });

    return entries.map(this.mapProjectContext);
  }

  // ============================================================
  // CONTEXT BUILDER
  // ============================================================

  /**
   * Build a context string with relevant memories for an agent.
   * This is the primary method used by the orchestrator to inject
   * memory context into agent prompts.
   *
   * Returns a formatted string containing:
   * - Relevant task patterns (what worked/didn't)
   * - Known error resolutions (avoid repeating mistakes)
   * - Project-specific context (decisions, patterns)
   */
  async buildMemoryContext(agentRole: AgentRole, task: string): Promise<string> {
    const parts: string[] = [];
    const agentName = agentRole.toUpperCase();

    parts.push(`=== ${agentName} MEMORY CONTEXT ===`);
    parts.push('');

    // 1. Find similar past task patterns
    const similarPatterns = await this.findSimilarPatterns(agentRole, task, 5);
    if (similarPatterns.length > 0) {
      parts.push('PAST TASK PATTERNS (what worked / what didn\'t):');
      for (const pattern of similarPatterns) {
        const icon = pattern.outcome === 'success' ? '✅' : pattern.outcome === 'failure' ? '❌' : '⚠️';
        parts.push(`  ${icon} [${pattern.taskType}] ${pattern.approach} → ${pattern.outcome} (confidence: ${(pattern.confidence * 100).toFixed(0)}%, seen ${pattern.frequency}x)`);
      }
      parts.push('');
    }

    // 2. Find relevant error resolutions
    const errorResolutions = await this.findErrorResolution(agentRole, task, 3);
    if (errorResolutions.length > 0) {
      parts.push('KNOWN ERROR RESOLUTIONS (avoid these mistakes):');
      for (const resolution of errorResolutions) {
        const successRate = resolution.workedCount + resolution.failedCount > 0
          ? ((resolution.workedCount / (resolution.workedCount + resolution.failedCount)) * 100).toFixed(0)
          : '0';
        parts.push(`  🔧 Error: "${resolution.errorPattern.substring(0, 80)}" → Fix: ${resolution.resolution} (worked ${resolution.workedCount}/${resolution.workedCount + resolution.failedCount} times, ${successRate}% success)`);
      }
      parts.push('');
    }

    // 3. Recall general memories relevant to this task
    const memories = await this.recallMemories(agentRole, task, 5);
    if (memories.length > 0) {
      parts.push('RELEVANT MEMORIES:');
      for (const memory of memories) {
        if (memory.category === 'task_pattern' || memory.category === 'error_resolution') {
          continue; // Already covered above
        }
        const context = memory.projectId ? ` [project: ${memory.projectId.substring(0, 8)}]` : '';
        parts.push(`  💡 ${memory.pattern}${memory.resolution ? ` → ${memory.resolution}` : ''}${context} (${(memory.confidence * 100).toFixed(0)}%)`);
      }
      parts.push('');
    }

    // 4. Cross-project pattern recognition
    // Find patterns that are common across multiple projects for this agent role
    const crossProjectPatterns = await this.getCrossProjectPatterns(agentRole);
    if (crossProjectPatterns.length > 0) {
      parts.push('CROSS-PROJECT INSIGHTS (patterns from other projects):');
      for (const insight of crossProjectPatterns.slice(0, 3)) {
        parts.push(`  🔗 ${insight}`);
      }
      parts.push('');
    }

    // If no memories found at all, return a minimal context
    if (similarPatterns.length === 0 && errorResolutions.length === 0 && memories.length === 0 && crossProjectPatterns.length === 0) {
      parts.push('(No prior memories found for this task. This may be a new pattern.)');
    }

    parts.push('=== END MEMORY CONTEXT ===');

    return parts.join('\n');
  }

  // ============================================================
  // CROSS-PROJECT PATTERN RECOGNITION
  // ============================================================

  /**
   * Identify patterns that appear across multiple projects for an agent.
   * E.g., if Frontend Lead always needs Tailwind config, that's a cross-project insight.
   */
  private async getCrossProjectPatterns(agentRole: string): Promise<string[]> {
    // Find task patterns that appear in multiple projects
    const patterns = await db.agentTaskPattern.findMany({
      where: {
        agentRole,
        outcome: 'success',
        projectId: { not: null },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { frequency: 'desc' },
      take: 50,
    });

    // Group by taskType + approach to find cross-project duplicates
    const patternMap = new Map<string, { approach: string; projectIds: Set<string>; frequency: number; confidence: number }>();

    for (const p of patterns) {
      if (!p.projectId) continue;
      const key = `${p.taskType}|||${p.approach}`;
      const existing = patternMap.get(key);
      if (existing) {
        existing.projectIds.add(p.projectId);
        existing.frequency += p.frequency;
        existing.confidence = (existing.confidence + p.confidence) / 2;
      } else {
        patternMap.set(key, {
          approach: p.approach,
          projectIds: new Set([p.projectId]),
          frequency: p.frequency,
          confidence: p.confidence,
        });
      }
    }

    // Filter to patterns seen in 2+ projects
    const insights: string[] = [];
    Array.from(patternMap.values()).forEach(data => {
      if (data.projectIds.size >= 2) {
        insights.push(
          `"${data.approach}" worked across ${data.projectIds.size} projects (seen ${data.frequency}x, ${(data.confidence * 100).toFixed(0)}% confidence)`,
        );
      }
    });

    return insights.sort((a, b) => b.length - a.length);
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  /**
   * Get statistics about an agent's memory.
   * Useful for monitoring, debugging, and understanding agent behavior.
   */
  async getAgentStats(agentRole: string): Promise<AgentMemoryStats> {
    // Count memories by category
    const [totalMemories, taskPatternsStored, errorResolutionsStored, projectContextsStored] =
      await Promise.all([
        db.agentMemoryEntry.count({ where: { agentRole } }),
        db.agentMemoryEntry.count({ where: { agentRole, category: 'task_pattern' } }),
        db.agentMemoryEntry.count({ where: { agentRole, category: 'error_resolution' } }),
        db.agentMemoryEntry.count({ where: { agentRole, category: 'project_context' } }),
      ]);

    // Count successful vs failed task patterns
    const [successfulPatterns, failedPatterns] = await Promise.all([
      db.agentTaskPattern.count({ where: { agentRole, outcome: 'success' } }),
      db.agentTaskPattern.count({ where: { agentRole, outcome: 'failure' } }),
    ]);

    // Calculate average confidence
    const memories = await db.agentMemoryEntry.findMany({
      where: { agentRole },
      select: { confidence: true },
    });
    const averageConfidence = memories.length > 0
      ? memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length
      : 0;

    // Find most common task types
    const taskPatterns = await db.agentTaskPattern.findMany({
      where: { agentRole },
      select: { taskType: true },
    });
    const taskTypeCounts = new Map<string, number>();
    for (const tp of taskPatterns) {
      taskTypeCounts.set(tp.taskType, (taskTypeCounts.get(tp.taskType) ?? 0) + 1);
    }
    const mostCommonTaskTypes = Array.from(taskTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([taskType, count]) => ({ taskType, count }));

    // Find top error patterns
    const errorResolutions = await db.agentErrorResolution.findMany({
      where: { agentRole },
      select: { errorPattern: true, workedCount: true },
      orderBy: { workedCount: 'desc' },
      take: 5,
    });
    const topErrorPatterns = errorResolutions.map(er => ({
      errorPattern: er.errorPattern,
      workedCount: er.workedCount,
    }));

    return {
      totalMemories,
      taskPatternsStored,
      errorResolutionsStored,
      projectContextsStored,
      successfulPatterns,
      failedPatterns,
      averageConfidence,
      mostCommonTaskTypes,
      topErrorPatterns,
    };
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /**
   * Remove expired memories from all memory tables.
   * Should be called periodically (e.g., once per day or at startup).
   *
   * Returns the number of entries cleaned up.
   */
  async cleanup(): Promise<{
    expiredMemories: number;
    expiredTaskPatterns: number;
    total: number;
  }> {
    const now = new Date();

    // Delete expired general memories
    const deletedMemories = await db.agentMemoryEntry.deleteMany({
      where: {
        expiresAt: { not: null, lt: now },
      },
    });

    // Delete expired task patterns
    const deletedTaskPatterns = await db.agentTaskPattern.deleteMany({
      where: {
        expiresAt: { not: null, lt: now },
      },
    });

    // Note: Error resolutions NEVER expire
    // Note: Project context NEVER expires (managed separately)

    const total = deletedMemories.count + deletedTaskPatterns.count;

    console.log(
      `[AION Memory] Cleanup complete: removed ${deletedMemories.count} expired memories, ${deletedTaskPatterns.count} expired task patterns`,
    );

    return {
      expiredMemories: deletedMemories.count,
      expiredTaskPatterns: deletedTaskPatterns.count,
      total,
    };
  }

  // ============================================================
  // BULK OPERATIONS
  // ============================================================

  /**
   * Get all memories for a specific agent (useful for agent dashboards).
   * Returns only non-expired memories.
   */
  async getAllMemoriesForAgent(
    agentRole: string,
    category?: AgentMemory['category'],
    limit: number = 50,
  ): Promise<AgentMemory[]> {
    const entries = await db.agentMemoryEntry.findMany({
      where: {
        agentRole,
        ...(category ? { category } : {}),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return entries.map(this.mapEntryToMemory);
  }

  /**
   * Get all task patterns for a specific agent.
   * Returns only non-expired patterns.
   */
  async getTaskPatternsForAgent(
    agentRole: string,
    outcome?: TaskPattern['outcome'],
    limit: number = 50,
  ): Promise<TaskPattern[]> {
    const entries = await db.agentTaskPattern.findMany({
      where: {
        agentRole,
        ...(outcome ? { outcome } : {}),
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { frequency: 'desc' },
      take: limit,
    });

    return entries.map(this.mapTaskPattern);
  }

  /**
   * Get all error resolutions for a specific agent.
   * Error resolutions are permanent (no expiry).
   */
  async getErrorResolutionsForAgent(
    agentRole: string,
    limit: number = 50,
  ): Promise<ErrorResolution[]> {
    const entries = await db.agentErrorResolution.findMany({
      where: { agentRole },
      orderBy: { workedCount: 'desc' },
      take: limit,
    });

    return entries.map(this.mapErrorResolution);
  }

  /**
   * Record that an error resolution was attempted and whether it worked.
   * This updates the worked/failed counts for tracking effectiveness.
   */
  async recordResolutionAttempt(
    agentRole: string,
    errorPattern: string,
    resolution: string,
    worked: boolean,
  ): Promise<void> {
    const existing = await db.agentErrorResolution.findFirst({
      where: {
        agentRole,
        errorPattern,
        resolution,
      },
    });

    if (existing) {
      await db.agentErrorResolution.update({
        where: { id: existing.id },
        data: {
          workedCount: worked ? { increment: 1 } : undefined,
          failedCount: !worked ? { increment: 1 } : undefined,
        },
      });
    }
    // If no existing resolution found, it should have been stored first via storeErrorResolution
  }

  /**
   * Delete all memories for a specific project.
   * Used when a project is deleted to clean up associated data.
   */
  async deleteProjectMemories(projectId: string): Promise<number> {
    const [memories, taskPatterns, errorResolutions, context] = await Promise.all([
      db.agentMemoryEntry.deleteMany({ where: { projectId } }),
      db.agentTaskPattern.deleteMany({ where: { projectId } }),
      db.agentErrorResolution.deleteMany({ where: { projectId } }),
      db.agentProjectContext.deleteMany({ where: { projectId } }),
    ]);

    const total = memories.count + taskPatterns.count + errorResolutions.count + context.count;
    console.log(`[AION Memory] Deleted ${total} memory entries for project ${projectId}`);
    return total;
  }

  // ============================================================
  // MAPPING HELPERS
  // ============================================================

  private mapEntryToMemory(entry: {
    id: string;
    agentRole: string;
    category: string;
    pattern: string;
    resolution: string | null;
    confidence: number;
    projectId: string | null;
    createdAt: Date;
    expiresAt: Date | null;
  }): AgentMemory {
    return {
      id: entry.id,
      agentRole: entry.agentRole,
      category: entry.category as AgentMemory['category'],
      pattern: entry.pattern,
      resolution: entry.resolution,
      confidence: entry.confidence,
      projectId: entry.projectId,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    };
  }

  private mapTaskPattern(entry: {
    id: string;
    agentRole: string;
    taskType: string;
    approach: string;
    outcome: string;
    confidence: number;
    frequency: number;
    projectId: string | null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date | null;
  }): TaskPattern {
    return {
      agentRole: entry.agentRole,
      taskType: entry.taskType,
      approach: entry.approach,
      outcome: entry.outcome as TaskPattern['outcome'],
      confidence: entry.confidence,
      frequency: entry.frequency,
    };
  }

  private mapErrorResolution(entry: {
    id: string;
    agentRole: string;
    errorPattern: string;
    resolution: string;
    workedCount: number;
    failedCount: number;
    projectId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ErrorResolution {
    return {
      agentRole: entry.agentRole,
      errorPattern: entry.errorPattern,
      resolution: entry.resolution,
      workedCount: entry.workedCount,
      failedCount: entry.failedCount,
    };
  }

  private mapProjectContext(entry: {
    id: string;
    projectId: string;
    key: string;
    value: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): ProjectContext {
    return {
      projectId: entry.projectId,
      key: entry.key,
      value: entry.value,
      updatedBy: entry.updatedBy,
      updatedAt: entry.updatedAt,
    };
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const agentMemory = new AgentMemoryStore();
