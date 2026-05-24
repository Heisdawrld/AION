// AION — AI SDK Wrapper
// Wraps z-ai-web-dev-sdk for structured agent calls

import ZAI from 'z-ai-web-dev-sdk';
import type { AgentRole } from '@/lib/types/aion';

let zaiInstance: ZAI | null = null;

async function getAI(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

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

/**
 * Call the AI model with structured prompts.
 * This is the ONLY way agents should interact with AI.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const startTime = Date.now();
  const ai = await getAI();

  try {
    const completion = await ai.chat.completions.create({
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userMessage },
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.3, // Low temperature for consistency
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
    console.error(`[AION AI] Error calling AI:`, error.message);
    throw new Error(`AI call failed: ${error.message}`);
  }
}

/**
 * Call AI and parse the response as JSON.
 * If parsing fails, returns null and logs the error.
 */
export async function callAIForJSON<T>(options: AICallOptions): Promise<{ data: T | null; raw: string; duration: number }> {
  // Add JSON instruction to system prompt
  const enhancedSystemPrompt = `${options.systemPrompt}\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.`;

  const result = await callAI({
    ...options,
    systemPrompt: enhancedSystemPrompt,
  });

  try {
    // Try to extract JSON from the response
    let jsonStr = result.content.trim();

    // Remove markdown code fences if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const data = JSON.parse(jsonStr) as T;
    return { data, raw: result.content, duration: result.duration };
  } catch (parseError) {
    console.error(`[AION AI] Failed to parse JSON response:`, parseError);
    console.error(`[AION AI] Raw response:`, result.content.substring(0, 500));
    return { data: null, raw: result.content, duration: result.duration };
  }
}

/**
 * Get a summary/completion for a quick AI call (no JSON needed)
 */
export async function callAIForText(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await callAI({ systemPrompt, userMessage, maxTokens: 2048 });
  return result.content;
}
