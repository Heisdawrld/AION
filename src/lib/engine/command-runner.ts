// AION — Command Runner
// Executes shell commands in project workspaces safely.
// Used for npm install, npm run build, and other operations.

import { execSync } from 'child_process';
import { workspaceManager } from './workspace-manager';

export interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number; // ms
}

export class CommandRunner {
  /**
   * Run a command in a project's workspace directory
   */
  runInWorkspace(projectId: string, command: string, options?: { timeout?: number }): CommandResult {
    const workspacePath = workspaceManager.getWorkspacePath(projectId);
    const timeout = options?.timeout || 120000; // 2 min default
    const startTime = Date.now();

    try {
      const stdout = execSync(command, {
        cwd: workspacePath,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CI: 'true', // Makes npm commands less verbose
        },
      });

      return {
        success: true,
        exitCode: 0,
        stdout: stdout || '',
        stderr: '',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        exitCode: error.status || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Install dependencies in a project workspace
   */
  installDeps(projectId: string, extraPackages?: string[]): CommandResult {
    if (extraPackages && extraPackages.length > 0) {
      return this.runInWorkspace(
        projectId,
        `npm install ${extraPackages.join(' ')} --save`,
        { timeout: 180000 }
      );
    }
    return this.runInWorkspace(projectId, 'npm install', { timeout: 180000 });
  }

  /**
   * Run the Next.js build
   */
  runBuild(projectId: string): CommandResult {
    return this.runInWorkspace(projectId, 'npm run build', { timeout: 180000 });
  }

  /**
   * Run TypeScript type checking
   */
  runTypeCheck(projectId: string): CommandResult {
    return this.runInWorkspace(projectId, 'npx tsc --noEmit', { timeout: 60000 });
  }

  /**
   * Run linting
   */
  runLint(projectId: string): CommandResult {
    return this.runInWorkspace(projectId, 'npm run lint 2>&1 || true', { timeout: 60000 });
  }

  /**
   * Test a live URL — makes an HTTP request and checks the response
   */
  async testUrl(url: string, expectedContent?: string): Promise<{
    success: boolean;
    statusCode: number;
    responseTime: number;
    containsExpectedContent: boolean;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      const responseTime = Date.now() - startTime;
      const text = await response.text();

      let containsExpectedContent = true;
      if (expectedContent) {
        containsExpectedContent = text.toLowerCase().includes(expectedContent.toLowerCase());
      }

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        containsExpectedContent,
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: 0,
        responseTime: Date.now() - startTime,
        containsExpectedContent: false,
        error: error.message,
      };
    }
  }
}

// Singleton
export const commandRunner = new CommandRunner();
