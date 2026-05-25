// AION — ZAI SDK Helper
// Ensures .z-ai-config exists before ZAI.create() is called.
// In production (Render), the config is auto-created from ZAI_* env vars.
// In development, the SDK reads from /etc/.z-ai-config or local .z-ai-config.

import ZAI from 'z-ai-web-dev-sdk';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

let zaiInstance: ZAI | null = null;
let configEnsured = false;

/**
 * Ensure .z-ai-config exists before ZAI.create() is called.
 */
export function ensureZAIConfig(): void {
  if (configEnsured) return;

  const configPaths = [
    join(process.cwd(), '.z-ai-config'),
    join(process.env.HOME || '/root', '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  // Check if any config already exists
  for (const p of configPaths) {
    if (existsSync(p)) {
      console.log(`[AION AI] Found z-ai config at: ${p}`);
      configEnsured = true;
      return;
    }
  }

  // No config found — create one from environment variables
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;

  if (!baseUrl && !apiKey) {
    console.error('[AION AI] WARNING: No .z-ai-config found and no ZAI_* env vars set. AI calls will fail.');
    configEnsured = true;
    return;
  }

  const config = {
    baseUrl: baseUrl || 'https://api.z.ai/v1',
    apiKey: apiKey || 'Z.ai',
    chatId: process.env.ZAI_CHAT_ID || `aion-${Date.now()}`,
    token: process.env.ZAI_TOKEN || '',
    userId: process.env.ZAI_USER_ID || 'aion-server',
  };

  // Write to project root first, then home dir as fallback
  for (const configPath of configPaths.slice(0, 2)) {
    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`[AION AI] Created .z-ai-config at: ${configPath}`);
      console.log(`[AION AI] baseUrl: ${config.baseUrl}`);
      break;
    } catch (err: any) {
      console.error(`[AION AI] Failed to write config to ${configPath}: ${err.message}`);
    }
  }

  configEnsured = true;
}

/**
 * Get a ZAI SDK instance with auto-config.
 * Use this instead of ZAI.create() directly.
 */
export async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    ensureZAIConfig();
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}
