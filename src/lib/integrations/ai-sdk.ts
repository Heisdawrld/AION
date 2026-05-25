// AION — AI SDK Wrapper
// Uses the Multi-Provider AI Router for reliable, scalable AI calls.
// Falls back to ZAI SDK when no OpenAI-compatible providers are configured.
//
// The router automatically:
//   - Routes agent calls to the best available provider per tier
//   - Fails over on 429/rate-limit errors
//   - Tracks rate limit recovery times
//   - Round-robins to distribute load
//
// Configure providers by setting API keys:
//   GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, SAMBANOVA_API_KEY, OPENROUTER_API_KEY
// Or legacy: OPENAI_API_KEY + OPENAI_BASE_URL

import { routerCall, getRouterStatus } from './ai-router';
import { getZAI } from './zai-helper';
import type { AgentRole } from '@/lib/types/aion';

// ============================================================
// INTERFACES
// ============================================================

export interface AICallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  agentRole?: AgentRole;
}

export interface AICallResult {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  duration: number;
  provider?: string;
  model?: string;
}

// ============================================================
// PROVIDER DETECTION
// ============================================================

function hasOpenAIProviders(): boolean {
  // Check if any OpenAI-compatible provider keys are set
  return !!(
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.SAMBANOVA_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

// Initialize and log on first import
let providerLogged = false;
function logProviderStatus(): void {
  if (providerLogged) return;
  providerLogged = true;

  if (hasOpenAIProviders()) {
    const status = getRouterStatus();
    console.log(`[AION AI] Multi-provider router active: ${status.providers.join(', ')} (${status.healthyEndpoints} endpoints)`);
  } else if (process.env.ZAI_BASE_URL || process.env.ZAI_API_KEY) {
    console.log('[AION AI] Using ZAI SDK (z-ai-web-dev-sdk)');
  } else {
    console.error('[AION AI] WARNING: No AI providers configured! Set GROQ_API_KEY, GEMINI_API_KEY, etc.');
  }
}

// ============================================================
// MAIN AI CALL — Routes through router or ZAI
// ============================================================

/**
 * Call the AI model with structured prompts.
 * This is the ONLY way agents should interact with AI.
 * Auto-selects provider and model based on agent role (Hybrid Brain).
 * Automatically fails over to next provider on rate limits.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  logProviderStatus();

  if (hasOpenAIProviders()) {
    const result = await routerCall({
      systemPrompt: options.systemPrompt,
      userMessage: options.userMessage,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      agentRole: options.agentRole,
    });

    return {
      content: result.content,
      usage: result.usage,
      duration: result.duration,
      provider: result.provider,
      model: result.model,
    };
  }

  // Fallback to ZAI SDK
  return callZAI(options);
}

// ============================================================
// ZAI FALLBACK — Only used when no OpenAI-compatible providers
// ============================================================

async function callZAI(options: AICallOptions): Promise<AICallResult> {
  const startTime = Date.now();
  const ai = await getZAI();

  try {
    const completion = await ai.chat.completions.create({
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userMessage },
      ],
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature || 0.3,
    });

    const content = completion.choices[0]?.message?.content || '';
    const duration = Date.now() - startTime;

    return {
      content,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      },
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AION AI] ZAI error:`, error.message);
    throw new Error(`AI call failed: ${error.message}`);
  }
}

// ============================================================
// JSON EXTRACTION — Robust parsing of AI responses
// ============================================================

/**
 * Extract JSON from a potentially messy AI response.
 * Handles: markdown code fences, trailing commas, extra text before/after JSON
 */
function extractJSON(raw: string): string | null {
  let text = raw.trim();

  // Strategy 1: Direct parse
  try {
    JSON.parse(text);
    return text;
  } catch {}

  // Strategy 2: Remove markdown code fences
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      JSON.parse(codeFenceMatch[1].trim());
      return codeFenceMatch[1].trim();
    } catch {}
  }

  // Strategy 3: Find JSON object or array in the text
  const jsonStart = Math.min(
    text.indexOf('{') >= 0 ? text.indexOf('{') : Infinity,
    text.indexOf('[') >= 0 ? text.indexOf('[') : Infinity
  );

  if (jsonStart !== Infinity) {
    const startChar = text[jsonStart];
    const endChar = startChar === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = jsonStart; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) { escapeNext = false; continue; }
      if (char === '\\') { escapeNext = true; continue; }
      if (char === '"') { inString = !inString; continue; }

      if (!inString) {
        if (char === startChar) depth++;
        if (char === endChar) depth--;

        if (depth === 0) {
          const candidate = text.substring(jsonStart, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            const fixed = candidate.replace(/,\s*([}\]])/g, '$1');
            try {
              JSON.parse(fixed);
              return fixed;
            } catch {}
          }
          break;
        }
      }
    }
  }

  // Strategy 4: Strip known prefixes
  const prefixes = ['```json\n', '```\n', '```'];
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();

  try {
    JSON.parse(text);
    return text;
  } catch {
    const fixed = text.replace(/,\s*([}\]])/g, '$1');
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {}
  }

  return null;
}

// ============================================================
// JSON AI CALL — For structured agent output
// ============================================================

/**
 * Call AI and parse the response as JSON.
 * Enhanced with robust extraction and automatic retry.
 */
export async function callAIForJSON<T>(options: AICallOptions): Promise<{ data: T | null; raw: string; duration: number }> {
  const enhancedSystemPrompt = `${options.systemPrompt}\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON. Start your response with { and end with }.`;

  const result = await callAI({
    ...options,
    systemPrompt: enhancedSystemPrompt,
  });

  const jsonStr = extractJSON(result.content);

  if (jsonStr) {
    try {
      const data = JSON.parse(jsonStr) as T;
      return { data, raw: result.content, duration: result.duration };
    } catch (parseError) {
      console.error(`[AION AI] JSON parse failed:`, parseError);
    }
  }

  // Retry once with stronger instructions
  console.log(`[AION AI] JSON extraction failed, retrying...`);

  const retryResult = await callAI({
    ...options,
    systemPrompt: `${enhancedSystemPrompt}\n\nYour previous response was NOT valid JSON. Output ONLY a JSON object, starting with { and ending with }. No other text.`,
    temperature: 0.1,
  });

  const retryJsonStr = extractJSON(retryResult.content);

  if (retryJsonStr) {
    try {
      const data = JSON.parse(retryJsonStr) as T;
      return { data, raw: retryResult.content, duration: result.duration + retryResult.duration };
    } catch (parseError) {
      console.error(`[AION AI] Retry JSON parse also failed:`, parseError);
    }
  }

  console.error(`[AION AI] All JSON extraction attempts failed.`);
  console.error(`[AION AI] Raw (first 500):`, result.content.substring(0, 500));
  return { data: null, raw: result.content, duration: result.duration };
}

/**
 * Quick AI text call (no JSON needed)
 */
export async function callAIForText(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await callAI({ systemPrompt, userMessage, maxTokens: 1024 });
  return result.content;
}

/**
 * Get current router status for debugging
 */
export { getRouterStatus };
