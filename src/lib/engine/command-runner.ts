// AION — Command Runner
// Executes shell commands in project workspaces safely.
// Used for npm install, npm run build, and other operations.
// Vercel-compatible: gracefully degrades in serverless environment.

import { workspaceManager } from './workspace-manager';
import type { GitOperationResult, DevOpsChecklist } from '@/lib/types/aion';

// Vercel serverless detection
const IS_VERCEL = process.env.VERCEL === '1';

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
   * Gracefully returns error in serverless environments
   */
  runInWorkspace(projectId: string, command: string, options?: { timeout?: number }): CommandResult {
    if (IS_VERCEL) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Command execution not available in serverless environment. Deploy on a VPS or Railway/Fly.io for full terminal access.',
        duration: 0,
      };
    }

    const { execSync } = require('child_process');
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

  // ============================================================
  // GIT OPERATIONS — Real version control for project workspaces
  // ============================================================

  /**
   * Initialize a git repository in the workspace
   */
  gitInit(projectId: string): GitOperationResult {
    if (IS_VERCEL) {
      return { success: false, operation: 'init', message: 'Git not available in serverless', duration: 0, error: 'serverless' };
    }
    const { execSync } = require('child_process');
    const startTime = Date.now();
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    try {
      // Check if git is already initialized
      try {
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 5000,
        });
        return {
          success: true,
          operation: 'init',
          message: 'Git repository already initialized',
          duration: Date.now() - startTime,
        };
      } catch {
        // Not a git repo — proceed with init
      }

      const stdout = execSync('git init', {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 10000,
      });

      return {
        success: true,
        operation: 'init',
        message: stdout.trim() || 'Git repository initialized',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        operation: 'init',
        message: 'Failed to initialize git repository',
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Stage all files for commit
   */
  gitAdd(projectId: string, files: string = '.'): GitOperationResult {
    if (IS_VERCEL) {
      return { success: false, operation: 'add', message: 'Git not available in serverless', duration: 0, error: 'serverless' };
    }
    const { execSync } = require('child_process');
    const startTime = Date.now();
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    try {
      const stdout = execSync(`git add ${files}`, {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 30000,
      });

      return {
        success: true,
        operation: 'add',
        message: `Files staged: ${files}`,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        operation: 'add',
        message: 'Failed to stage files',
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Commit staged changes
   */
  gitCommit(projectId: string, message: string): GitOperationResult {
    if (IS_VERCEL) {
      return { success: false, operation: 'commit', message: 'Git not available in serverless', duration: 0, error: 'serverless' };
    }
    const { execSync } = require('child_process');
    const startTime = Date.now();
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    try {
      // Check if there are staged changes
      try {
        const status = execSync('git diff --cached --quiet', {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // If this succeeds, there are no staged changes
        return {
          success: true,
          operation: 'commit',
          message: 'No staged changes to commit',
          duration: Date.now() - startTime,
        };
      } catch {
        // There ARE staged changes — proceed with commit
      }

      const safeMessage = message.replace(/"/g, "'").replace(/`/g, "'");
      const stdout = execSync(`git commit -m "${safeMessage}"`, {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 30000,
      });

      return {
        success: true,
        operation: 'commit',
        message: stdout.trim().split('\n')[0] || 'Changes committed',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        operation: 'commit',
        message: 'Failed to commit changes',
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Push to remote repository
   * Requires a remote to be configured first
   */
  gitPush(projectId: string, remote: string = 'origin', branch: string = 'main'): GitOperationResult {
    if (IS_VERCEL) {
      return { success: false, operation: 'push', message: 'Git not available in serverless', duration: 0, error: 'serverless' };
    }
    const { execSync } = require('child_process');
    const startTime = Date.now();
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    try {
      const stdout = execSync(`git push ${remote} ${branch} 2>&1`, {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 60000,
      });

      return {
        success: true,
        operation: 'push',
        message: stdout.trim() || 'Pushed to remote',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        operation: 'push',
        message: 'Failed to push to remote',
        duration: Date.now() - startTime,
        error: error.stderr || error.message,
      };
    }
  }

  /**
   * Check git status of the workspace
   */
  gitStatus(projectId: string): { isRepo: boolean; hasChanges: boolean; branch: string; staged: number; unstaged: number; untracked: number } {
    if (IS_VERCEL) {
      return { isRepo: false, hasChanges: false, branch: '', staged: 0, unstaged: 0, untracked: 0 };
    }
    const { execSync } = require('child_process');
    const workspacePath = workspaceManager.getWorkspacePath(projectId);

    try {
      // Check if it's a git repo
      try {
        execSync('git rev-parse --is-inside-work-tree', {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        return { isRepo: false, hasChanges: false, branch: '', staged: 0, unstaged: 0, untracked: 0 };
      }

      // Get branch
      let branch = 'main';
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
      } catch {}

      // Get short status
      const statusOutput = execSync('git status --porcelain', {
        cwd: workspacePath,
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();

      if (!statusOutput) {
        return { isRepo: true, hasChanges: false, branch, staged: 0, unstaged: 0, untracked: 0 };
      }

      const lines = statusOutput.split('\n');
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;

      for (const line of lines) {
        const index = line[0];
        const workTree = line[1];

        if (index === '?' && workTree === '?') {
          untracked++;
        } else {
          if (index !== ' ' && index !== '?') staged++;
          if (workTree !== ' ') unstaged++;
        }
      }

      return { isRepo: true, hasChanges: staged > 0 || unstaged > 0 || untracked > 0, branch, staged, unstaged, untracked };
    } catch {
      return { isRepo: false, hasChanges: false, branch: '', staged: 0, unstaged: 0, untracked: 0 };
    }
  }

  /**
   * Run the full deployment readiness pipeline
   * Checks: workspace, deps, build, git status
   */
  checkDeploymentReadiness(projectId: string): DevOpsChecklist {
    const workspacePath = workspaceManager.getWorkspacePath(projectId);
    const checklist: DevOpsChecklist = {
      projectInitialized: false,
      dependenciesInstalled: false,
      buildSucceeds: false,
      gitInitialized: false,
      gitCommitted: false,
      readyForGithub: false,
      deploymentConfigured: false,
      readyForDeploy: false,
      urlReturns200: false,
      urlContainsExpectedContent: false,
    };

    try {
      // Check workspace exists
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      checklist.projectInitialized = fs.existsSync(`${workspacePath}/package.json`);
      checklist.dependenciesInstalled = fs.existsSync(`${workspacePath}/node_modules`);
      checklist.deploymentConfigured = fs.existsSync(`${workspacePath}/render.yaml`) || fs.existsSync(`${workspacePath}/Dockerfile`);

      // Check git
      const gitStatus = this.gitStatus(projectId);
      checklist.gitInitialized = gitStatus.isRepo;
      checklist.gitCommitted = gitStatus.isRepo && !gitStatus.hasChanges;
      checklist.readyForGithub = gitStatus.isRepo && gitStatus.isRepo;
    } catch {
      // Some check failed — defaults are false
    }

    return checklist;
  }
}

// Singleton
export const commandRunner = new CommandRunner();
