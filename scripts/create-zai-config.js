#!/usr/bin/env node
// AION — Create z-ai-web-dev-sdk config from environment variables
// The SDK requires a .z-ai-config file but on Render we use env vars instead.
// This script creates the config file at startup.

const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), '.z-ai-config');

// Check if config already exists (e.g., from local dev)
if (fs.existsSync(configPath)) {
  console.log('[z-ai-config] Config file already exists, skipping creation');
  process.exit(0);
}

// Build config from environment variables
const config = {
  baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/v1',
  apiKey: process.env.ZAI_API_KEY || 'Z.ai',
  chatId: process.env.ZAI_CHAT_ID || `aion-${Date.now()}`,
  token: process.env.ZAI_TOKEN || '',
  userId: process.env.ZAI_USER_ID || 'aion-server',
};

// Validate - we need at least a baseUrl
if (!config.baseUrl) {
  console.warn('[z-ai-config] WARNING: ZAI_BASE_URL not set, using default');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('[z-ai-config] Created .z-ai-config at', configPath);
console.log('[z-ai-config] baseUrl:', config.baseUrl);
