// AION — Cost Tracker
// Enterprise feature that tracks AI API costs per agent, per project, and per task.
// Provides cost breakdowns, budget alerts, and trend analysis.
// Costs are stored in cents (hundredths of USD) to avoid floating-point issues.

import { db } from '@/lib/db';

// ============================================================
// COST TYPES
// ============================================================

export interface AICostEntry {
  id: string;
  projectId?: string;
  agentRole: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  duration: number;
  estimatedCost: number; // in cents
  taskSnippet?: string;
  createdAt: Date;
}

export interface CostBreakdown {
  totalCost: number; // in cents
  byAgent: Record<string, { cost: number; calls: number; tokens: number }>;
  byProject: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
}

export interface BudgetConfig {
  projectId?: string;
  dailyLimit: number;   // in cents
  monthlyLimit: number; // in cents
  alertThreshold: number; // 0-1, e.g. 0.8 means alert at 80% of limit
}

export interface CostAlert {
  type: 'daily_limit' | 'monthly_limit' | 'threshold';
  message: string;
  currentCost: number; // in cents
  limit: number;       // in cents
}

export interface CostTrendPoint {
  date: string;       // YYYY-MM-DD
  cost: number;       // in cents
  calls: number;
}

// ============================================================
// MODEL PRICING (per 1K tokens, in cents)
// ============================================================

interface ModelPricing {
  inputPer1K: number;  // cost in cents per 1K input tokens
  outputPer1K: number; // cost in cents per 1K output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4': {
    inputPer1K: 3.0,    // $0.03
    outputPer1K: 6.0,   // $0.06
  },
  'gpt-4-turbo': {
    inputPer1K: 1.0,    // $0.01
    outputPer1K: 3.0,   // $0.03
  },
  'gpt-3.5-turbo': {
    inputPer1K: 0.05,   // $0.0005
    outputPer1K: 0.15,  // $0.0015
  },
  'claude-3-opus': {
    inputPer1K: 1.5,    // $0.015
    outputPer1K: 7.5,   // $0.075
  },
  'claude-3-sonnet': {
    inputPer1K: 0.3,    // $0.003
    outputPer1K: 1.5,   // $0.015
  },
};

const DEFAULT_PRICING: ModelPricing = {
  inputPer1K: 1.0,   // $0.01
  outputPer1K: 3.0,  // $0.03
};

// ============================================================
// HELPER: Estimate cost without recording
// ============================================================

/**
 * Quick cost estimate without recording to the database.
 * Returns cost in cents.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model.toLowerCase()] ?? DEFAULT_PRICING;
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K;
  return Math.round((inputCost + outputCost) * 100) / 100; // round to 2 decimal places in cents
}

// ============================================================
// COST TRACKER CLASS
// ============================================================

export class CostTracker {
  // ----------------------------------------------------------
  // Record an AI API call cost
  // ----------------------------------------------------------

  async recordCost(entry: Omit<AICostEntry, 'id' | 'createdAt'>): Promise<string> {
    const costRecord = await db.aICostEntry.create({
      data: {
        projectId: entry.projectId ?? null,
        agentRole: entry.agentRole,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        duration: entry.duration,
        estimatedCost: entry.estimatedCost,
        taskSnippet: entry.taskSnippet ?? null,
      },
    });

    // After recording, proactively check budget and log alerts
    const alerts = await this.checkBudget(entry.projectId);
    if (alerts.length > 0) {
      for (const alert of alerts) {
        console.warn(
          `[AION CostTracker] BUDGET ALERT: ${alert.type} — ${alert.message} (current: $${this.formatCost(alert.currentCost)}, limit: $${this.formatCost(alert.limit)})`
        );
      }
    }

    return costRecord.id;
  }

  // ----------------------------------------------------------
  // Get costs for a specific project
  // ----------------------------------------------------------

  async getProjectCosts(
    projectId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AICostEntry[]> {
    const where: any = { projectId };
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const records = await db.aICostEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(this.toAICostEntry);
  }

  // ----------------------------------------------------------
  // Get costs for a specific agent across all projects
  // ----------------------------------------------------------

  async getAgentCosts(
    agentRole: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AICostEntry[]> {
    const where: any = { agentRole };
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const records = await db.aICostEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(this.toAICostEntry);
  }

  // ----------------------------------------------------------
  // Get detailed cost breakdown
  // ----------------------------------------------------------

  async getCostBreakdown(
    projectId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CostBreakdown> {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const records = await db.aICostEntry.findMany({ where });

    const breakdown: CostBreakdown = {
      totalCost: 0,
      byAgent: {},
      byProject: {},
      byModel: {},
    };

    for (const record of records) {
      const cost = record.estimatedCost;
      const tokens = record.inputTokens + record.outputTokens;

      breakdown.totalCost += cost;

      // By agent
      if (!breakdown.byAgent[record.agentRole]) {
        breakdown.byAgent[record.agentRole] = { cost: 0, calls: 0, tokens: 0 };
      }
      breakdown.byAgent[record.agentRole].cost += cost;
      breakdown.byAgent[record.agentRole].calls += 1;
      breakdown.byAgent[record.agentRole].tokens += tokens;

      // By project
      const projectKey = record.projectId ?? '__global__';
      if (!breakdown.byProject[projectKey]) {
        breakdown.byProject[projectKey] = { cost: 0, calls: 0 };
      }
      breakdown.byProject[projectKey].cost += cost;
      breakdown.byProject[projectKey].calls += 1;

      // By model
      if (!breakdown.byModel[record.model]) {
        breakdown.byModel[record.model] = { cost: 0, calls: 0 };
      }
      breakdown.byModel[record.model].cost += cost;
      breakdown.byModel[record.model].calls += 1;
    }

    // Round all aggregated costs to 2 decimal places
    breakdown.totalCost = Math.round(breakdown.totalCost * 100) / 100;
    for (const agent of Object.values(breakdown.byAgent)) {
      agent.cost = Math.round(agent.cost * 100) / 100;
      agent.tokens = Math.round(agent.tokens);
    }
    for (const project of Object.values(breakdown.byProject)) {
      project.cost = Math.round(project.cost * 100) / 100;
    }
    for (const model of Object.values(breakdown.byModel)) {
      model.cost = Math.round(model.cost * 100) / 100;
    }

    return breakdown;
  }

  // ----------------------------------------------------------
  // Set budget limits
  // ----------------------------------------------------------

  async setBudget(config: BudgetConfig): Promise<string> {
    // Upsert: if a budget for this projectId already exists, update it
    const existing = await db.budgetConfig.findFirst({
      where: { projectId: config.projectId ?? null },
    });

    if (existing) {
      await db.budgetConfig.update({
        where: { id: existing.id },
        data: {
          dailyLimit: config.dailyLimit,
          monthlyLimit: config.monthlyLimit,
          alertThreshold: config.alertThreshold,
        },
      });
      return existing.id;
    }

    const budget = await db.budgetConfig.create({
      data: {
        projectId: config.projectId ?? null,
        dailyLimit: config.dailyLimit,
        monthlyLimit: config.monthlyLimit,
        alertThreshold: config.alertThreshold,
      },
    });

    return budget.id;
  }

  // ----------------------------------------------------------
  // Check if budget limits are exceeded — returns alerts
  // ----------------------------------------------------------

  async checkBudget(projectId?: string): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];

    // Check project-specific budget first, then global budget
    const budgetsToCheck: (string | undefined)[] = [];
    if (projectId) budgetsToCheck.push(projectId);
    budgetsToCheck.push(undefined); // global budget

    for (const pid of budgetsToCheck) {
      const budget = await db.budgetConfig.findFirst({
        where: { projectId: pid ?? null },
      });

      if (!budget) continue;

      const dailyCost = await this.getDailyCost(pid);
      const monthlyCost = await this.getMonthlyCost(pid);

      // Check daily limit
      if (dailyCost >= budget.dailyLimit) {
        const label = pid ? `Project ${pid}` : 'Global';
        alerts.push({
          type: 'daily_limit',
          message: `${label} daily budget exceeded`,
          currentCost: dailyCost,
          limit: budget.dailyLimit,
        });
      } else if (dailyCost >= budget.dailyLimit * budget.alertThreshold) {
        const label = pid ? `Project ${pid}` : 'Global';
        alerts.push({
          type: 'threshold',
          message: `${label} daily cost has reached ${Math.round(budget.alertThreshold * 100)}% of the daily limit`,
          currentCost: dailyCost,
          limit: budget.dailyLimit,
        });
      }

      // Check monthly limit
      if (monthlyCost >= budget.monthlyLimit) {
        const label = pid ? `Project ${pid}` : 'Global';
        alerts.push({
          type: 'monthly_limit',
          message: `${label} monthly budget exceeded`,
          currentCost: monthlyCost,
          limit: budget.monthlyLimit,
        });
      } else if (monthlyCost >= budget.monthlyLimit * budget.alertThreshold) {
        const label = pid ? `Project ${pid}` : 'Global';
        alerts.push({
          type: 'threshold',
          message: `${label} monthly cost has reached ${Math.round(budget.alertThreshold * 100)}% of the monthly limit`,
          currentCost: monthlyCost,
          limit: budget.monthlyLimit,
        });
      }
    }

    return alerts;
  }

  // ----------------------------------------------------------
  // Get today's total cost (in cents)
  // ----------------------------------------------------------

  async getDailyCost(projectId?: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const where: any = {
      createdAt: { gte: startOfDay },
    };
    if (projectId) where.projectId = projectId;

    const result = await db.aICostEntry.aggregate({
      _sum: { estimatedCost: true },
      where,
    });

    return Math.round((result._sum.estimatedCost ?? 0) * 100) / 100;
  }

  // ----------------------------------------------------------
  // Get this month's total cost (in cents)
  // ----------------------------------------------------------

  async getMonthlyCost(projectId?: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const where: any = {
      createdAt: { gte: startOfMonth },
    };
    if (projectId) where.projectId = projectId;

    const result = await db.aICostEntry.aggregate({
      _sum: { estimatedCost: true },
      where,
    });

    return Math.round((result._sum.estimatedCost ?? 0) * 100) / 100;
  }

  // ----------------------------------------------------------
  // Get daily cost trend for N days
  // ----------------------------------------------------------

  async getCostTrend(projectId?: string, days: number = 30): Promise<CostTrendPoint[]> {
    const trend: CostTrendPoint[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const where: any = {
        createdAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      };
      if (projectId) where.projectId = projectId;

      const [aggResult, countResult] = await Promise.all([
        db.aICostEntry.aggregate({
          _sum: { estimatedCost: true },
          where,
        }),
        db.aICostEntry.count({ where }),
      ]);

      trend.push({
        date: dayStart.toISOString().slice(0, 10),
        cost: Math.round((aggResult._sum.estimatedCost ?? 0) * 100) / 100,
        calls: countResult,
      });
    }

    return trend;
  }

  // ----------------------------------------------------------
  // Format cost in USD (from cents)
  // ----------------------------------------------------------

  formatCost(cents: number): string {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(dollars);
  }

  // ----------------------------------------------------------
  // Private: map DB record to AICostEntry interface
  // ----------------------------------------------------------

  private toAICostEntry(record: any): AICostEntry {
    return {
      id: record.id,
      projectId: record.projectId ?? undefined,
      agentRole: record.agentRole,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      duration: record.duration,
      estimatedCost: record.estimatedCost,
      taskSnippet: record.taskSnippet ?? undefined,
      createdAt: record.createdAt,
    };
  }
}

// Singleton
export const costTracker = new CostTracker();
