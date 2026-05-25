// AION — Multi-Provider AI Router
// The PERMANENT solution for massive projects.
//
// Instead of relying on ONE AI provider (which always hits rate limits),
// this router pools MULTIPLE free providers and automatically:
//   1. Routes agent calls to the best available provider per tier
//   2. Fails over to the next provider on 429/rate-limit errors
//   3. Tracks rate limit recovery times from error messages
//   4. Round-robins within a tier to distribute load
//
// Supported providers (all FREE, all OpenAI-compatible):
//   - Groq       (llama-3.3-70b-versatile, llama-3.1-8b-instant)
//   - Gemini     (gemini-2.0-flash, gemini-2.0-flash-lite)
//   - Cerebras   (llama-3.3-70b, llama-3.1-8b)
//   - Sambanova  (Meta-Llama-3.3-70B-Instruct, Meta-Llama-3.1-8B-Instruct)
//   - OpenRouter (various free models)
//
// Just set the API keys: GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, etc.
// The more keys you add, the more capacity AION gets!
//
// Architecture:
//   Heavy agents (CTO, Business) → 70B/Flash models (best reasoning)
//   Medium agents (Coders)      → 70B models (fast generation)
//   Light agents (QA, Reviewers)→ 8B/Lite models (cheap, fast)

import type { AgentRole } from '@/lib/types/aion';

// ============================================================
// TYPES
// ============================================================

type AgentTier = 'heavy' | 'medium' | 'light';

interface ProviderEndpoint {
  name: string;           // e.g., "groq", "gemini"
  apiKey: string;
  baseUrl: string;
  model: string;
  tier: AgentTier;
  priority: number;       // Lower = preferred for this tier
  rateLimitedUntil: number; // Unix timestamp (ms) when rate limit expires
  totalCalls: number;
  failedCalls: number;
  lastError?: string;
  lastErrorTime?: number;
}

interface RouterCallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  agentRole?: AgentRole;
}

interface RouterCallResult {
  content: string;
  provider: string;
  model: string;
  tier: AgentTier;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  duration: number;
  retries: number;
}

// ============================================================
// AGENT TIER CLASSIFICATION
// ============================================================

const HEAVY_AGENTS: AgentRole[] = ['cto', 'business'];
const MEDIUM_AGENTS: AgentRole[] = ['frontend', 'backend', 'devops', 'design', 'integration', 'data'];
const LIGHT_AGENTS: AgentRole[] = ['qa', 'security', 'performance', 'docs', 'analytics', 'compliance', 'research'];

function getAgentTier(agentRole?: AgentRole): AgentTier {
  if (!agentRole) return 'medium';
  if (HEAVY_AGENTS.includes(agentRole)) return 'heavy';
  if (LIGHT_AGENTS.includes(agentRole)) return 'light';
  return 'medium';
}

// ============================================================
// PROVIDER REGISTRY — Auto-discovered from environment variables
// ============================================================

let endpoints: ProviderEndpoint[] = [];
let initialized = false;
let roundRobinCounters: Record<AgentTier, number> = { heavy: 0, medium: 0, light: 0 };

function initializeProviders(): void {
  if (initialized) return;
  endpoints = [];
  let endpointIndex = 0;

  // --- GROQ ---
  if (process.env.GROQ_API_KEY) {
    const key = process.env.GROQ_API_KEY;
    const base = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

    // Groq 70B — heavy + medium tier
    endpoints.push({
      name: 'groq', apiKey: key, baseUrl: base,
      model: process.env.GROQ_HEAVY_MODEL || 'llama-3.3-70b-versatile',
      tier: 'heavy', priority: 20, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'groq', apiKey: key, baseUrl: base,
      model: process.env.GROQ_MEDIUM_MODEL || 'llama-3.3-70b-versatile',
      tier: 'medium', priority: 10, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    // Groq 8B — light tier
    endpoints.push({
      name: 'groq', apiKey: key, baseUrl: base,
      model: process.env.GROQ_LIGHT_MODEL || 'llama-3.1-8b-instant',
      tier: 'light', priority: 10, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
  }

  // --- GEMINI ---
  if (process.env.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY;
    const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';

    // Gemini Flash — heavy tier (best reasoning among free models)
    endpoints.push({
      name: 'gemini', apiKey: key, baseUrl: base,
      model: process.env.GEMINI_HEAVY_MODEL || 'gemini-2.0-flash',
      tier: 'heavy', priority: 5, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    // Gemini Flash — medium tier (also good for coding)
    endpoints.push({
      name: 'gemini', apiKey: key, baseUrl: base,
      model: process.env.GEMINI_MEDIUM_MODEL || 'gemini-2.0-flash',
      tier: 'medium', priority: 20, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    // Gemini Flash-Lite — light tier
    endpoints.push({
      name: 'gemini', apiKey: key, baseUrl: base,
      model: process.env.GEMINI_LIGHT_MODEL || 'gemini-2.0-flash-lite',
      tier: 'light', priority: 5, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
  }

  // --- CEREBRAS ---
  if (process.env.CEREBRAS_API_KEY) {
    const key = process.env.CEREBRAS_API_KEY;
    const base = process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';

    // Cerebras 70B — medium tier (ultra-fast inference)
    endpoints.push({
      name: 'cerebras', apiKey: key, baseUrl: base,
      model: process.env.CEREBRAS_HEAVY_MODEL || 'llama-3.3-70b',
      tier: 'heavy', priority: 30, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'cerebras', apiKey: key, baseUrl: base,
      model: process.env.CEREBRAS_MEDIUM_MODEL || 'llama-3.3-70b',
      tier: 'medium', priority: 15, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    // Cerebras 8B — light tier
    endpoints.push({
      name: 'cerebras', apiKey: key, baseUrl: base,
      model: process.env.CEREBRAS_LIGHT_MODEL || 'llama-3.1-8b',
      tier: 'light', priority: 15, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
  }

  // --- SAMBANOVA ---
  if (process.env.SAMBANOVA_API_KEY) {
    const key = process.env.SAMBANOVA_API_KEY;
    const base = process.env.SAMBANOVA_BASE_URL || 'https://api.sambanova.ai/v1';

    endpoints.push({
      name: 'sambanova', apiKey: key, baseUrl: base,
      model: process.env.SAMBANOVA_HEAVY_MODEL || 'Meta-Llama-3.3-70B-Instruct',
      tier: 'heavy', priority: 40, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'sambanova', apiKey: key, baseUrl: base,
      model: process.env.SAMBANOVA_MEDIUM_MODEL || 'Meta-Llama-3.3-70B-Instruct',
      tier: 'medium', priority: 25, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'sambanova', apiKey: key, baseUrl: base,
      model: process.env.SAMBANOVA_LIGHT_MODEL || 'Meta-Llama-3.1-8B-Instruct',
      tier: 'light', priority: 25, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
  }

  // --- OPENROUTER ---
  if (process.env.OPENROUTER_API_KEY) {
    const key = process.env.OPENROUTER_API_KEY;
    const base = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    endpoints.push({
      name: 'openrouter', apiKey: key, baseUrl: base,
      model: process.env.OPENROUTER_HEAVY_MODEL || 'google/gemini-2.0-flash-001',
      tier: 'heavy', priority: 50, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'openrouter', apiKey: key, baseUrl: base,
      model: process.env.OPENROUTER_MEDIUM_MODEL || 'meta-llama/llama-3.3-70b-instruct',
      tier: 'medium', priority: 30, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'openrouter', apiKey: key, baseUrl: base,
      model: process.env.OPENROUTER_LIGHT_MODEL || 'meta-llama/llama-3.1-8b-instruct',
      tier: 'light', priority: 30, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
  }

  // --- LEGACY: OpenAI-compatible single provider (backward compat) ---
  if (process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    endpoints.push({
      name: 'openai-compat', apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      tier: 'heavy', priority: 100, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'openai-compat', apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      tier: 'medium', priority: 100, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    endpoints.push({
      name: 'openai-compat', apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_LIGHT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      tier: 'light', priority: 100, rateLimitedUntil: 0,
      totalCalls: 0, failedCalls: 0,
    });
    // Legacy heavy/light overrides
    if (process.env.OPENAI_HEAVY_API_KEY) {
      endpoints.push({
        name: 'openai-heavy', apiKey: process.env.OPENAI_HEAVY_API_KEY,
        baseUrl: process.env.OPENAI_HEAVY_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_HEAVY_MODEL || 'gpt-4o-mini',
        tier: 'heavy', priority: 5, rateLimitedUntil: 0,
        totalCalls: 0, failedCalls: 0,
      });
    }
    if (process.env.OPENAI_LIGHT_API_KEY) {
      endpoints.push({
        name: 'openai-light', apiKey: process.env.OPENAI_LIGHT_API_KEY,
        baseUrl: process.env.OPENAI_LIGHT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_LIGHT_MODEL || 'gpt-4o-mini',
        tier: 'light', priority: 5, rateLimitedUntil: 0,
        totalCalls: 0, failedCalls: 0,
      });
    }
  }

  initialized = true;

  const providerNames = [...new Set(endpoints.map(e => e.name))];
  const heavyCount = endpoints.filter(e => e.tier === 'heavy').length;
  const mediumCount = endpoints.filter(e => e.tier === 'medium').length;
  const lightCount = endpoints.filter(e => e.tier === 'light').length;

  console.log(`[AION Router] Initialized with ${providerNames.length} providers: ${providerNames.join(', ')}`);
  console.log(`[AION Router] Endpoints — Heavy: ${heavyCount}, Medium: ${mediumCount}, Light: ${lightCount}`);

  if (endpoints.length === 0) {
    console.error('[AION Router] WARNING: No AI providers configured! Set GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY');
  }
}

// ============================================================
// PROVIDER SELECTION — Best available for tier, with round-robin
// ============================================================

function getAvailableEndpoints(tier: AgentTier): ProviderEndpoint[] {
  const now = Date.now();
  return endpoints
    .filter(e => e.tier === tier && now >= e.rateLimitedUntil)
    .sort((a, b) => a.priority - b.priority); // Lower priority = preferred
}

function selectEndpoint(tier: AgentTier): ProviderEndpoint | null {
  const available = getAvailableEndpoints(tier);

  if (available.length === 0) {
    // All rate-limited — find the one that recovers soonest
    const tierEndpoints = endpoints.filter(e => e.tier === tier);
    if (tierEndpoints.length === 0) return null;

    const soonest = tierEndpoints.reduce((best, ep) =>
      ep.rateLimitedUntil < best.rateLimitedUntil ? ep : best
    );

    const waitMs = soonest.rateLimitedUntil - Date.now();
    if (waitMs > 0) {
      console.log(`[AION Router] All ${tier} endpoints rate-limited. Waiting ${Math.ceil(waitMs / 1000)}s for ${soonest.name}/${soonest.model}`);
    }
    return soonest;
  }

  // Round-robin among same-priority endpoints to distribute load
  const topPriority = available[0].priority;
  const topTier = available.filter(e => e.priority === topPriority);

  if (topTier.length === 1) return topTier[0];

  const idx = roundRobinCounters[tier] % topTier.length;
  roundRobinCounters[tier]++;
  return topTier[idx];
}

// ============================================================
// RATE LIMIT PARSING — Extract retry-after from error messages
// ============================================================

function parseRateLimitReset(errorText: string): number {
  const now = Date.now();

  // Try to find "retry in X.Xs" pattern (Gemini, Groq)
  const retryMatch = errorText.match(/retry\s+in\s+([\d.]+)\s*s/i);
  if (retryMatch) {
    return now + parseFloat(retryMatch[1]) * 1000 + 1000; // +1s buffer
  }

  // Try "Retry-After: X" header
  const retryAfterMatch = errorText.match(/retry.?after[:\s]+(\d+)/i);
  if (retryAfterMatch) {
    return now + parseInt(retryAfterMatch[1]) * 1000;
  }

  // Try "Please retry after Xs"
  const pleaseRetryMatch = errorText.match(/please\s+retry\s+after\s+([\d.]+)\s*s/i);
  if (pleaseRetryMatch) {
    return now + parseFloat(pleaseRetryMatch[1]) * 1000 + 1000;
  }

  // Default: rate limit typically resets in 60 seconds
  return now + 60_000;
}

function markRateLimited(endpoint: ProviderEndpoint, errorText: string): void {
  const resetTime = parseRateLimitReset(errorText);
  endpoint.rateLimitedUntil = resetTime;
  endpoint.failedCalls++;

  const waitSecs = Math.ceil((resetTime - Date.now()) / 1000);
  console.log(`[AION Router] ${endpoint.name}/${endpoint.model} rate-limited for ~${waitSecs}s`);

  // Also mark sibling endpoints from the same provider (they share the same rate limit)
  for (const ep of endpoints) {
    if (ep.name === endpoint.name && ep.apiKey === endpoint.apiKey) {
      ep.rateLimitedUntil = Math.max(ep.rateLimitedUntil, resetTime);
    }
  }
}

// ============================================================
// CORE: Make an AI call with automatic failover
// ============================================================

const MAX_FAILOVER_RETRIES = 3; // Try up to 3 different providers
const MAX_TOTAL_RETRIES = 5;    // Absolute max (including same-provider retries)

export async function routerCall(options: RouterCallOptions): Promise<RouterCallResult> {
  initializeProviders();

  const tier = getAgentTier(options.agentRole);
  const maxTokensByTier: Record<AgentTier, number> = {
    heavy: 2048,
    medium: 1536,
    light: 1024,
  };
  const targetTokens = options.maxTokens || maxTokensByTier[tier];

  let lastError: string = '';
  let totalRetries = 0;

  // Try failover across providers
  for (let attempt = 0; attempt < MAX_FAILOVER_RETRIES; attempt++) {
    const endpoint = selectEndpoint(tier);

    if (!endpoint) {
      throw new Error(`[AION Router] No AI providers available for ${tier} tier. Add more API keys (GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, etc.)`);
    }

    // If the selected endpoint is rate-limited, wait for it to recover
    const now = Date.now();
    if (now < endpoint.rateLimitedUntil) {
      const waitMs = endpoint.rateLimitedUntil - now;
      if (waitMs <= 30_000) { // Only wait up to 30 seconds
        console.log(`[AION Router] Waiting ${Math.ceil(waitMs / 1000)}s for ${endpoint.name}/${endpoint.model}...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } else {
        // Skip this endpoint, try next
        console.log(`[AION Router] ${endpoint.name} rate-limited for ${Math.ceil(waitMs / 1000)}s — trying next provider`);
        continue;
      }
    }

    try {
      const result = await callProvider(endpoint, {
        ...options,
        maxTokens: targetTokens,
        temperature: options.temperature ?? (tier === 'heavy' ? 0.4 : 0.3),
      });

      endpoint.totalCalls++;
      return {
        ...result,
        tier,
        retries: totalRetries,
      };
    } catch (error: any) {
      totalRetries++;
      endpoint.failedCalls++;
      endpoint.lastError = error.message;
      endpoint.lastErrorTime = Date.now();
      lastError = error.message;

      // Check if this is a rate limit error
      if (isRateLimitError(error.message)) {
        markRateLimited(endpoint, error.message);
        console.warn(`[AION Router] ${endpoint.name}/${endpoint.model} hit rate limit (attempt ${attempt + 1}/${MAX_FAILOVER_RETRIES})`);
        continue; // Try next provider
      }

      // Check if this is a model/context error (no point retrying other providers with same model)
      if (isModelError(error.message)) {
        console.error(`[AION Router] ${endpoint.name}/${endpoint.model} model error: ${error.message}`);
        // For model errors, try next provider — it might have a different model
        continue;
      }

      // For other errors (network, timeout), try next provider
      console.warn(`[AION Router] ${endpoint.name}/${endpoint.model} error: ${error.message}`);
      continue;
    }
  }

  // All failover attempts exhausted — try one more time with any available endpoint
  // after a short delay
  if (totalRetries < MAX_TOTAL_RETRIES) {
    console.log(`[AION Router] All ${tier} providers rate-limited. Waiting 10s then retrying...`);
    await new Promise(resolve => setTimeout(resolve, 10_000));

    // Clear rate limits that should have expired
    const now = Date.now();
    for (const ep of endpoints) {
      if (ep.rateLimitedUntil <= now) {
        ep.rateLimitedUntil = 0;
      }
    }

    const endpoint = selectEndpoint(tier);
    if (endpoint) {
      try {
        const result = await callProvider(endpoint, {
          ...options,
          maxTokens: targetTokens,
          temperature: options.temperature ?? 0.3,
        });
        endpoint.totalCalls++;
        return { ...result, tier, retries: totalRetries + 1 };
      } catch (error: any) {
        lastError = error.message;
        if (isRateLimitError(error.message)) {
          markRateLimited(endpoint, error.message);
        }
      }
    }
  }

  throw new Error(`AI call failed after ${totalRetries} retries across providers. Last error: ${lastError}`);
}

// ============================================================
// PROVIDER CALL — Direct HTTP fetch (no SDK dependency)
// ============================================================

async function callProvider(
  endpoint: ProviderEndpoint,
  options: RouterCallOptions & { temperature: number }
): Promise<Omit<RouterCallResult, 'tier' | 'retries'>> {
  const startTime = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${endpoint.apiKey}`,
  };

  // OpenRouter needs additional headers
  if (endpoint.name === 'openrouter') {
    headers['HTTP-Referer'] = 'https://aion-mv5t.onrender.com';
    headers['X-Title'] = 'AION';
  }

  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userMessage },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const duration = Date.now() - startTime;

  return {
    content,
    provider: endpoint.name,
    model: endpoint.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
    duration,
  };
}

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

function isRateLimitError(message: string): boolean {
  return /429|rate.?limit|quota.?exceeded|too.?many.?requests|resource.?exhausted|rate_limit/i.test(message);
}

function isModelError(message: string): boolean {
  return /model.?not.?found|invalid.?model|context.?length|token.?limit.?exceeded|content_too_long/i.test(message);
}

// ============================================================
// ROUTER STATUS — For debugging and health monitoring
// ============================================================

export interface RouterStatus {
  providers: string[];
  totalEndpoints: number;
  healthyEndpoints: number;
  rateLimitedEndpoints: number;
  tierStatus: Record<AgentTier, {
    total: number;
    available: number;
    providers: { name: string; model: string; available: boolean; rateLimitedFor: number }[];
  }>;
  totalCalls: number;
  totalFailures: number;
}

export function getRouterStatus(): RouterStatus {
  initializeProviders();

  const now = Date.now();
  const providerNames = [...new Set(endpoints.map(e => e.name))];
  const healthy = endpoints.filter(e => now >= e.rateLimitedUntil).length;
  const rateLimited = endpoints.filter(e => now < e.rateLimitedUntil).length;

  const tierStatus: RouterStatus['tierStatus'] = { heavy: { total: 0, available: 0, providers: [] }, medium: { total: 0, available: 0, providers: [] }, light: { total: 0, available: 0, providers: [] } };

  for (const tier of ['heavy', 'medium', 'light'] as AgentTier[]) {
    const tierEndpoints = endpoints.filter(e => e.tier === tier);
    tierStatus[tier].total = tierEndpoints.length;
    tierStatus[tier].available = tierEndpoints.filter(e => now >= e.rateLimitedUntil).length;
    tierStatus[tier].providers = tierEndpoints.map(e => ({
      name: e.name,
      model: e.model,
      available: now >= e.rateLimitedUntil,
      rateLimitedFor: Math.max(0, Math.ceil((e.rateLimitedUntil - now) / 1000)),
    }));
  }

  return {
    providers: providerNames,
    totalEndpoints: endpoints.length,
    healthyEndpoints: healthy,
    rateLimitedEndpoints: rateLimited,
    tierStatus,
    totalCalls: endpoints.reduce((sum, e) => sum + e.totalCalls, 0),
    totalFailures: endpoints.reduce((sum, e) => sum + e.failedCalls, 0),
  };
}

// ============================================================
// RESET — For testing
// ============================================================

export function resetRouter(): void {
  initialized = false;
  endpoints = [];
  roundRobinCounters = { heavy: 0, medium: 0, light: 0 };
}
