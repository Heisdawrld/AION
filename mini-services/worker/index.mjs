import { execSync } from 'child_process';

const controlPlaneUrl = process.env.AION_CONTROL_PLANE_URL || 'http://localhost:3000';
const apiKey = process.env.AION_API_KEY || process.env.NEXT_PUBLIC_AION_API_KEY || '';
const pollIntervalMs = Number(process.env.AION_WORKER_POLL_MS || 4000);
const maxOutputLength = 100_000;

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-aion-api-key'] = apiKey;
  return headers;
}

function truncate(value) {
  if (!value) return '';
  return value.length > maxOutputLength
    ? `${value.slice(0, maxOutputLength)}\n... [output truncated]`
    : value;
}

async function claimRun() {
  const response = await fetch(`${controlPlaneUrl}/api/worker/claim`, {
    method: 'POST',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Claim failed (${response.status})`);
  }

  return response.json();
}

async function reportRun(payload) {
  const response = await fetch(`${controlPlaneUrl}/api/worker/report`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Report failed (${response.status})`);
  }

  return response.json();
}

function runCommand(command, workspacePath) {
  const start = Date.now();

  try {
    const stdout = execSync(command, {
      cwd: workspacePath,
      timeout: 120000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 5,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CI: 'true',
        FORCE_COLOR: '0',
        TERM: 'dumb',
      },
    });

    return {
      success: true,
      output: truncate(stdout || ''),
      error: '',
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      output: truncate((error.stdout || '').toString()),
      error: truncate((error.stderr || error.message || '').toString()),
      duration: Date.now() - start,
    };
  }
}

function extractBranchInfo(workspacePath) {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let defaultBranch = currentBranch;
    try {
      const remoteHead = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: workspacePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      defaultBranch = remoteHead.split('/').pop() || currentBranch;
    } catch {}

    return { currentBranch, defaultBranch };
  } catch {
    return null;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|hr|blockquote|section|article|header|footer|nav|aside|main|figure|figcaption|details|summary|pre)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function extractTitle(html, fallbackUrl) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return stripHtml(titleMatch[1]).trim();
  }
  return fallbackUrl;
}

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const href = new URL(match[1], baseUrl).href;
      if (seen.has(href)) continue;
      seen.add(href);
      links.push({
        href,
        text: stripHtml(match[2]).trim() || href,
      });
    } catch {}
  }

  return links.slice(0, 50);
}

async function visitUrl(url) {
  const start = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
  });
  const html = await response.text();
  const title = extractTitle(html, url);
  const text = stripHtml(html);
  const links = extractLinks(html, url);

  return {
    success: response.ok,
    output: truncate(text),
    error: response.ok ? '' : `HTTP ${response.status}`,
    duration: Date.now() - start,
    statusCode: response.status,
    title,
    html: truncate(html),
    text,
    links,
  };
}

async function handleRun(claimed) {
  const { run, workspace, workspacePath } = claimed;

  if (!run || !workspacePath) {
    return;
  }

  if (run.kind !== 'command' && run.kind !== 'git' && run.kind !== 'browser') {
    await reportRun({
      runId: run.id,
      status: 'failed',
      error: `Unsupported run kind for v1 worker: ${run.kind}`,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  if (!run.command) {
    await reportRun({
      runId: run.id,
      status: 'failed',
      error: 'Missing command payload',
      completedAt: new Date().toISOString(),
    });
    return;
  }

  let resolvedCommand = run.command;
  if (run.kind === 'git' && workspace?.repoUrl) {
    resolvedCommand = resolvedCommand.replaceAll('__REPO_URL__', workspace.repoUrl);
  }

  const result = run.kind === 'browser'
    ? await visitUrl(resolvedCommand)
    : runCommand(resolvedCommand, workspacePath);
  const combinedLog = [
    run.kind === 'browser' ? `[browser] ${resolvedCommand}` : `$ ${resolvedCommand}`,
    result.output,
    result.error ? `\n[stderr]\n${result.error}` : '',
    `\n[duration_ms] ${result.duration}`,
  ].join('\n');

  const branchInfo = result.success && run.kind !== 'browser' ? extractBranchInfo(workspacePath) : null;
  const browserArtifacts = run.kind === 'browser'
    ? [
        {
          kind: 'html',
          title: `Browser HTML: ${result.title || resolvedCommand}`,
          contentType: 'text/html',
          content: result.html,
          sizeBytes: result.html?.length || 0,
        },
        {
          kind: 'json',
          title: `Browser summary: ${result.title || resolvedCommand}`,
          contentType: 'application/json',
          content: JSON.stringify({
            url: resolvedCommand,
            title: result.title,
            statusCode: result.statusCode,
            linkCount: result.links?.length || 0,
            links: result.links || [],
          }, null, 2),
          sizeBytes: JSON.stringify(result.links || []).length,
        },
      ]
    : [];

  await reportRun({
    runId: run.id,
    status: result.success ? 'completed' : 'failed',
    output: result.output,
    error: result.error || null,
    completedAt: new Date().toISOString(),
    workspaceUpdate: {
      currentBranch: branchInfo?.currentBranch ?? workspace?.currentBranch ?? null,
      defaultBranch: branchInfo?.defaultBranch ?? workspace?.defaultBranch ?? null,
      status: result.success ? 'ready' : 'error',
      lastSyncedAt: new Date().toISOString(),
    },
    artifacts: [
      {
        kind: 'log',
        title: `Run log: ${run.summary}`,
        contentType: 'text/plain',
        content: truncate(combinedLog),
        sizeBytes: combinedLog.length,
      },
      ...browserArtifacts,
    ],
  });
}

async function main() {
  console.log(`[AION Worker] Polling ${controlPlaneUrl} every ${pollIntervalMs}ms`);

  while (true) {
    try {
      const claimed = await claimRun();
      if (claimed.run) {
        console.log(`[AION Worker] Claimed run ${claimed.run.id}: ${claimed.run.summary}`);
        await handleRun(claimed);
      }
    } catch (error) {
      console.error('[AION Worker] Error:', error.message);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch(error => {
  console.error('[AION Worker] Fatal:', error);
  process.exit(1);
});
