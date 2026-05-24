// AION — Terminal API Route
// Executes arbitrary shell commands in project workspaces.
// Like having an IDE terminal — but scoped to the project workspace.

import { NextRequest, NextResponse } from 'next/server';
import { workspaceManager } from '@/lib/engine/workspace-manager';
import { execSync } from 'child_process';

// ============================================================
// SAFETY: Blocked commands that could damage the host system
// ============================================================
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',   // fork bomb
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  'format',
  'del /f /s /q C:',
  'rd /s /q C:',
];

// Commands that require explicit confirmation flag
const SENSITIVE_PATTERNS = [
  /\brm\s+(-rf?|-fr?)\s+[^.]/,  // rm -rf something (not ./something)
  /\bgit\s+push\s+--force/,       // force push
  /\bnpm\s+publish/,               // publish to npm
  /\bdocker\s+rm/,                 // remove docker containers
  /\bkubectl\s+delete/,            // k8s delete
];

// Max output length to prevent memory issues
const MAX_OUTPUT_LENGTH = 100_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, command, timeout = 30000 } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'command is required and must be a string' },
        { status: 400 }
      );
    }

    // Trim the command
    const trimmedCommand = command.trim();

    if (!trimmedCommand) {
      return NextResponse.json(
        { error: 'command cannot be empty' },
        { status: 400 }
      );
    }

    // ========================================
    // SAFETY: Block dangerous commands
    // ========================================
    const lowerCommand = trimmedCommand.toLowerCase();

    for (const blocked of BLOCKED_COMMANDS) {
      if (lowerCommand.includes(blocked.toLowerCase())) {
        return NextResponse.json({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `⛔ Command blocked for safety: "${blocked}" is not allowed. This terminal is scoped to your project workspace.`,
          duration: 0,
          blocked: true,
        });
      }
    }

    // Check sensitive patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        return NextResponse.json({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: `⚠️ Potentially destructive command detected. If you're sure, use the AION dashboard or CLI directly. This terminal prevents accidental data loss.`,
          duration: 0,
          blocked: true,
        });
      }
    }

    // ========================================
    // RESOLVE WORKSPACE PATH
    // ========================================
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    // Verify workspace exists
    const workspaceExists = await workspaceManager.workspaceExists(projectId);
    if (!workspaceExists) {
      return NextResponse.json({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: `Workspace not found. Initialize the project first.`,
        duration: 0,
      });
    }

    // ========================================
    // EXECUTE THE COMMAND
    // ========================================
    const startTime = Date.now();
    const maxTimeout = Math.min(timeout, 120000); // Cap at 2 minutes

    try {
      const stdout = execSync(trimmedCommand, {
        cwd: workspacePath,
        timeout: maxTimeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CI: 'true',
          FORCE_COLOR: '0', // No ANSI colors in output
          TERM: 'dumb',     // Dumb terminal — no escape sequences
        },
      });

      const duration = Date.now() - startTime;

      // Truncate output if too large
      const truncatedStdout = stdout.length > MAX_OUTPUT_LENGTH
        ? stdout.substring(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]'
        : stdout;

      return NextResponse.json({
        success: true,
        exitCode: 0,
        stdout: truncatedStdout,
        stderr: '',
        duration,
        command: trimmedCommand,
        workspacePath,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const stdout = (error.stdout || '').toString();
      const stderr = (error.stderr || error.message || '').toString();

      const truncatedStdout = stdout.length > MAX_OUTPUT_LENGTH
        ? stdout.substring(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]'
        : stdout;

      const truncatedStderr = stderr.length > MAX_OUTPUT_LENGTH
        ? stderr.substring(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]'
        : stderr;

      // Check if it was a timeout
      const isTimeout = error.killed === true || error.signal === 'SIGTERM';

      return NextResponse.json({
        success: false,
        exitCode: error.status || 1,
        stdout: truncatedStdout,
        stderr: isTimeout
          ? `Command timed out after ${maxTimeout / 1000}s. Try a shorter command or increase timeout.`
          : truncatedStderr,
        duration,
        command: trimmedCommand,
        workspacePath,
        timedOut: isTimeout,
      });
    }
  } catch (error: any) {
    console.error('[AION Terminal API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// GET — List workspace directory contents
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const dirPath = searchParams.get('path') || '';

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const workspacePath = workspaceManager.getWorkspacePath(projectId);
    const workspaceExists = await workspaceManager.workspaceExists(projectId);

    if (!workspaceExists) {
      return NextResponse.json({
        files: [],
        directories: [],
        workspacePath,
        exists: false,
      });
    }

    // List files in the workspace
    const files = await workspaceManager.listFiles(projectId, dirPath);

    // Get workspace info
    const info = await workspaceManager.getWorkspaceInfo(projectId);

    return NextResponse.json({
      files,
      workspacePath,
      exists: true,
      info,
    });
  } catch (error: any) {
    console.error('[AION Terminal API] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
