// AION — AI SDK Wrapper (Hybrid Brain Architecture)
// Routes different agent roles to different AI models based on complexity.
// Inspired by Gemini's "Hybrid Brain" recommendation:
//   - CTO/Architect → heavy model (Gemini Flash / Llama 70B)
//   - Coders → fast model (Llama 70B on Groq)
//   - Reviewers/Testers → light model (Llama 8B / Flash-Lite)
//
// Configure via env vars:
//   OPENAI_API_KEY - primary provider key (Groq, Gemini, OpenAI, etc.)
//   OPENAI_BASE_URL - primary provider endpoint
//   OPENAI_MODEL - default model for medium-complexity agents
//   OPENAI_HEAVY_API_KEY - key for heavy reasoning (CTO, Architect)
//   OPENAI_HEAVY_BASE_URL - endpoint for heavy model
//   OPENAI_HEAVY_MODEL - model for CTO/Architect (e.g., gemini-2.0-flash)
//   OPENAI_LIGHT_API_KEY - key for light tasks (Reviewers, QA)
//   OPENAI_LIGHT_BASE_URL - endpoint for light model
//   OPENAI_LIGHT_MODEL - model for reviewers (e.g., llama-3.1-8b-instant)

import ZAI from 'z-ai-web-dev-sdk';
import { getZAI } from '@/lib/integrations/zai-helper';
import type { AgentRole } from '@/lib/types/aion';

// ============================================================
// HYBRID BRAIN MODEL ROUTING
// ============================================================

type AgentTier = 'heavy' | 'medium' | 'light';

const HEAVY_AGENTS: AgentRole[] = ['cto', 'business']; // High reasoning
const MEDIUM_AGENTS: AgentRole[] = ['frontend', 'backend', 'devops', 'design', 'integration']; // Code generation
const LIGHT_AGENTS: AgentRole[] = ['qa', 'security', 'performance', 'docs', 'data', 'analytics', 'compliance', 'research']; // Review/analysis

function getAgentTier(agentRole?: AgentRole): AgentTier {
  if (!agentRole) return 'medium';
  if (HEAVY_AGENTS.includes(agentRole)) return 'heavy';
  if (LIGHT_AGENTS.includes(agentRole)) return 'light';
  return 'medium';
}

interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getModelForTier(tier: AgentTier): ModelConfig {
  switch (tier) {
    case 'heavy':
      return {
        apiKey: process.env.OPENAI_HEAVY_API_KEY || process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_HEAVY_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_HEAVY_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };
    case 'light':
      return {
        apiKey: process.env.OPENAI_LIGHT_API_KEY || process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_LIGHT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_LIGHT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };
    case 'medium':
    default:
      return {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };
  }
}

// Detect primary provider
type AIProvider = 'zai' | 'openai';

function detectProvider(): AIProvider {
  if (process.env.OPENAI_API_KEY) return 'openai';
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
  agentRole?: AgentRole; // Used for hybrid brain routing
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
// OPENAI-COMPATIBLE PROVIDER (Direct fetch — works with any provider)
// ============================================================

async function callOpenAI(options: AICallOptions): Promise<AICallResult> {
  const startTime = Date.now();
  const tier = getAgentTier(options.agentRole);
  const config = getModelForTier(tier);

  if (!config.apiKey) {
    throw new Error('No API key configured. Set OPENAI_API_KEY env var.');
  }

  // Adjust max_tokens by tier
  const maxTokensByTier: Record<AgentTier, number> = {
    heavy: 2048,
    medium: 1536,
    light: 1024,
  };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userMessage },
        ],
        max_tokens: options.maxTokens || maxTokensByTier[tier],
        temperature: options.temperature ?? (tier === 'heavy' ? 0.4 : 0.3),
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
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[AION AI] ${tier}/${config.model} error:`, error.message);
    throw new Error(`AI call failed: ${error.message}`);
  }
}

// ============================================================
// ZAI PROVIDER (z-ai-web-dev-sdk — only works inside Z.ai)
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
// UNIFIED AI CALL (auto-selects provider + model by agent tier)
// ============================================================

/**
 * Call the AI model with structured prompts.
 * This is the ONLY way agents should interact with AI.
 * Auto-selects provider and model based on agent role (Hybrid Brain).
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
