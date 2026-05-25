// AION — AI SDK Wrapper (Enhanced with Multi-Provider Support)
// Supports: z-ai-web-dev-sdk (Z.ai), OpenAI, or any OpenAI-compatible API
// In production, set OPENAI_API_KEY to use OpenAI directly (works on any host)
// In development, uses z-ai-web-dev-sdk via local config

import ZAI from 'z-ai-web-dev-sdk';
import { getZAI } from '@/lib/integrations/zai-helper';
import type { AgentRole } from '@/lib/types/aion';

// ============================================================
// PROVIDER DETECTION
// ============================================================

type AIProvider = 'zai' | 'openai';

function detectProvider(): AIProvider {
  // If OPENAI_API_KEY is set, prefer OpenAI (works on any host including Render)
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  // Default to z-ai-web-dev-sdk (works in Z.ai environment)
  return 'zai';
}

const provider = detectProvider();
console.log(`[AION AI] Using provider: ${provider}`);

// ============================================================
// INTERFACES
// ============================================================

export interface AICallOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AICallResult {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  duration: number; // ms
}

// ============================================================
// OPENAI PROVIDER (Direct fetch — no SDK needed)
// ============================================================

async function callOpenAI(options: AICallOptions): Promise<AICallResult> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY!;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userMessage },
        ],
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const duration = Date.now() - startTime;

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AION AI] OpenAI error:`, error.message);
    throw new Error(`AI call failed: ${error.message}`);
  }
}

// ============================================================
// ZAI PROVIDER (z-ai-web-dev-sdk)
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
      max_tokens: options.maxTokens || 4096,
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
// UNIFIED AI CALL (auto-selects provider)
// ============================================================

/**
 * Call the AI model with structured prompts.
 * This is the ONLY way agents should interact with AI.
 * Auto-selects between z-ai-web-dev-sdk and OpenAI based on env vars.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  if (provider === 'openai') {
    return callOpenAI(options);
  }
  return callZAI(options);
}

/**
 * Extract JSON from a potentially messy AI response.
 * Handles: markdown code fences, trailing commas, extra text before/after JSON
 */
function extractJSON(raw: string): string | null {
  let text = raw.trim();

  // Strategy 1: Direct parse — the response is pure JSON
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

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

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
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
    }
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
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

/**
 * Call AI and parse the response as JSON.
 * Enhanced with robust extraction and automatic retry.
 * If parsing fails after retry, returns null.
 */
export async function callAIForJSON<T>(options: AICallOptions): Promise<{ data: T | null; raw: string; duration: number }> {
  const enhancedSystemPrompt = `${options.systemPrompt}\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON. Start your response with { and end with }.`;

  // First attempt
  const result = await callAI({
    ...options,
    systemPrompt: enhancedSystemPrompt,
  });

  // Try to extract JSON
  const jsonStr = extractJSON(result.content);

  if (jsonStr) {
    try {
      const data = JSON.parse(jsonStr) as T;
      return { data, raw: result.content, duration: result.duration };
    } catch (parseError) {
      console.error(`[AION AI] JSON parse failed even after extraction:`, parseError);
    }
  }

  // If extraction failed, try once more with stronger instructions
  console.log(`[AION AI] First JSON extraction failed, retrying with stronger prompt...`);

  const retryResult = await callAI({
    ...options,
    systemPrompt: `${enhancedSystemPrompt}\n\nYour previous response was NOT valid JSON. You MUST output ONLY a JSON object, starting with { and ending with }. No other text.`,
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
  console.error(`[AION AI] Raw response (first 500 chars):`, result.content.substring(0, 500));
  return { data: null, raw: result.content, duration: result.duration };
}

/**
 * Get a summary/completion for a quick AI call (no JSON needed)
 */
export async function callAIForText(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await callAI({ systemPrompt, userMessage, maxTokens: 2048 });
  return result.content;
}
