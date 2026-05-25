// AION — Workspace Manager
// Manages project workspace directories on the filesystem.
// This is what makes AION real — generated code actually lives on disk.
// Vercel-compatible: uses /tmp in serverless, cwd/workspaces otherwise.

import { promises as fs } from 'fs';
import path from 'path';
import { db } from '@/lib/db';

// Vercel serverless has writable /tmp; otherwise use project workspaces
const IS_VERCEL = process.env.VERCEL === '1';
const WORKSPACE_ROOT = IS_VERCEL
  ? path.join('/tmp', 'aion-workspaces')
  : path.join(process.cwd(), 'workspaces');

export interface WorkspaceInfo {
  projectId: string;
  workspacePath: string;
  isInitialized: boolean;
  hasNextApp: boolean;
  packageJsonExists: boolean;
}

export interface RepoWorkspaceInfo {
  workspaceId: string;
  projectId: string;
  workspacePath: string;
  existsOnDisk: boolean;
  repoUrl: string | null;
  currentBranch: string | null;
  defaultBranch: string | null;
  status: string;
}

export class WorkspaceManager {
  private resolveWorkspacePath(baseName: string): string {
    return path.join(WORKSPACE_ROOT, baseName);
  }

  private ensureWithinWorkspaceRoot(targetPath: string): string {
    const normalizedRoot = path.resolve(WORKSPACE_ROOT);
    const normalizedTarget = path.resolve(targetPath);

    if (!normalizedTarget.startsWith(normalizedRoot)) {
      throw new Error(`Path escapes workspace root: ${normalizedTarget}`);
    }

    return normalizedTarget;
  }

  /**
   * Get the workspace path for a project
   */
  getWorkspacePath(projectId: string): string {
    return this.resolveWorkspacePath(projectId);
  }

  /**
   * Get the workspace path for a repo workspace.
   * Falls back to the workspace id when no custom root path is set.
   */
  getRepoWorkspacePath(workspaceId: string, customRootPath?: string | null): string {
    const candidate = customRootPath
      ? this.resolveWorkspacePath(customRootPath)
      : this.resolveWorkspacePath(workspaceId);

    return this.ensureWithinWorkspaceRoot(candidate);
  }

  /**
   * Check if a workspace exists
   */
  async workspaceExists(projectId: string): Promise<boolean> {
    try {
      await fs.access(this.getWorkspacePath(projectId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get workspace info
   */
  async getWorkspaceInfo(projectId: string): Promise<WorkspaceInfo> {
    const workspacePath = this.getWorkspacePath(projectId);
    let isInitialized = false;
    let hasNextApp = false;
    let packageJsonExists = false;

    try {
      await fs.access(workspacePath);
      isInitialized = true;

      try {
        await fs.access(path.join(workspacePath, 'package.json'));
        packageJsonExists = true;
      } catch {}

      try {
        await fs.access(path.join(workspacePath, 'next.config.ts'));
        hasNextApp = true;
      } catch {}
    } catch {}

    return {
      projectId,
      workspacePath,
      isInitialized,
      hasNextApp,
      packageJsonExists,
    };
  }

  /**
   * Create the workspace directory
   */
  async createWorkspace(projectId: string): Promise<string> {
    const workspacePath = this.getWorkspacePath(projectId);
    await fs.mkdir(workspacePath, { recursive: true });
    console.log(`[AION Workspace] Created: ${workspacePath}`);
    return workspacePath;
  }

  /**
   * Initialize a Next.js project in the workspace
   * This creates a minimal Next.js app structure
   */
  async initializeNextApp(projectId: string, projectName: string): Promise<{ success: boolean; error?: string }> {
    const workspacePath = this.getWorkspacePath(projectId);

    try {
      // Check if already initialized
      const info = await this.getWorkspaceInfo(projectId);
      if (info.hasNextApp) {
        console.log(`[AION Workspace] Next.js app already exists at ${workspacePath}`);
        return { success: true };
      }

      // Ensure workspace exists
      await fs.mkdir(workspacePath, { recursive: true });

      // Create package.json
      const packageJson = {
        name: projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        version: '0.1.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'next lint',
        },
        dependencies: {
          next: '^14.2.0',
          react: '^18.3.0',
          'react-dom': '^18.3.0',
        },
        devDependencies: {
          typescript: '^5',
          '@types/node': '^20',
          '@types/react': '^18',
          '@types/react-dom': '^18',
          tailwindcss: '^3.4.0',
          postcss: '^8',
          autoprefixer: '^10',
        },
      };

      await fs.writeFile(
        path.join(workspacePath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create tsconfig.json
      const tsConfig = {
        compilerOptions: {
          target: 'es5',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      };

      await fs.writeFile(
        path.join(workspacePath, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2)
      );

      // Create next.config.js
      await fs.writeFile(
        path.join(workspacePath, 'next.config.js'),
        '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n'
      );

      // Create tailwind.config.ts
      await fs.writeFile(
        path.join(workspacePath, 'tailwind.config.ts'),
        `import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: [\n    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",\n    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",\n    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\nexport default config;\n`
      );

      // Create postcss.config.mjs
      await fs.writeFile(
        path.join(workspacePath, 'postcss.config.mjs'),
        '/** @type {import("postcss-load-config").Config} */\nconst config = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\nexport default config;\n'
      );

      // Create directory structure
      await fs.mkdir(path.join(workspacePath, 'src', 'app'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'src', 'components'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'src', 'lib'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'public'), { recursive: true });

      // Create globals.css
      await fs.writeFile(
        path.join(workspacePath, 'src', 'app', 'globals.css'),
        '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
      );

      // Create layout.tsx
      await fs.writeFile(
        path.join(workspacePath, 'src', 'app', 'layout.tsx'),
        `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = {\n  title: "${projectName}",\n  description: "Built by AION",\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body className="antialiased">{children}</body>\n    </html>\n  );\n}\n`
      );

      // Create page.tsx
      await fs.writeFile(
        path.join(workspacePath, 'src', 'app', 'page.tsx'),
        `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center p-24">\n      <h1 className="text-4xl font-bold">${projectName}</h1>\n      <p className="mt-4 text-lg text-gray-600">Built by AION</p>\n    </main>\n  );\n}\n`
      );

      console.log(`[AION Workspace] Next.js app initialized at ${workspacePath}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[AION Workspace] Failed to initialize Next.js app:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Write a file to the workspace
   */
  async writeFile(projectId: string, filePath: string, content: string): Promise<void> {
    const fullPath = this.ensureWithinWorkspaceRoot(path.join(this.getWorkspacePath(projectId), filePath));

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Write multiple files to the workspace
   */
  async writeFiles(projectId: string, files: { path: string; content: string }[]): Promise<void> {
    for (const file of files) {
      await this.writeFile(projectId, file.path, file.content);
    }
  }

  /**
   * Read a file from the workspace
   */
  async readFile(projectId: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = this.ensureWithinWorkspaceRoot(path.join(this.getWorkspacePath(projectId), filePath));
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * List all files in the workspace
   */
  async listFiles(projectId: string, dirPath: string = ''): Promise<string[]> {
    const fullPath = path.join(this.getWorkspacePath(projectId), dirPath);
    return this.listFilesAtPath(fullPath, dirPath);
  }

  async listFilesAtPath(basePath: string, dirPath: string = ''): Promise<string[]> {
    const fullPath = this.ensureWithinWorkspaceRoot(path.join(basePath, dirPath));

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        // Skip node_modules, .next, .git
        if (['node_modules', '.next', '.git'].includes(entry.name)) continue;

        const relativePath = dirPath ? `${dirPath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          const subFiles = await this.listFilesAtPath(basePath, relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Install npm dependencies in the workspace
   */
  async installDependencies(projectId: string, packages?: string[]): Promise<{ success: boolean; error?: string }> {
    // No shell access on Vercel serverless
    if (IS_VERCEL) {
      console.log('[AION Workspace] Skipping npm install in serverless environment');
      return { success: false, error: 'Not available in serverless environment' };
    }

    const workspacePath = this.getWorkspacePath(projectId);

    try {
      const { execSync } = await import('child_process');
      if (packages && packages.length > 0) {
        // Install specific packages
        const installCmd = `cd "${workspacePath}" && npm install ${packages.join(' ')} --save 2>&1`;
        console.log(`[AION Workspace] Installing packages: ${packages.join(', ')}`);
        execSync(installCmd, { timeout: 120000 });
      } else {
        // Install all dependencies from package.json
        console.log(`[AION Workspace] Installing all dependencies`);
        execSync(`cd "${workspacePath}" && npm install 2>&1`, { timeout: 120000 });
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[AION Workspace] Install failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from the workspace
   */
  async deleteFile(projectId: string, filePath: string): Promise<void> {
    const fullPath = this.ensureWithinWorkspaceRoot(path.join(this.getWorkspacePath(projectId), filePath));
    try {
      await fs.unlink(fullPath);
    } catch {
      // File might not exist, that's ok
    }
  }

  async getRepoWorkspaceInfo(workspaceId: string): Promise<RepoWorkspaceInfo | null> {
    const workspace = await db.repoWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return null;

    const workspacePath = this.getRepoWorkspacePath(workspace.id, workspace.rootPath);

    let existsOnDisk = false;
    try {
      await fs.access(workspacePath);
      existsOnDisk = true;
    } catch {}

    return {
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      workspacePath,
      existsOnDisk,
      repoUrl: workspace.repoUrl,
      currentBranch: workspace.currentBranch,
      defaultBranch: workspace.defaultBranch,
      status: workspace.status,
    };
  }

  async createRepoWorkspace(workspaceId: string, customRootPath?: string | null): Promise<string> {
    const workspacePath = this.getRepoWorkspacePath(workspaceId, customRootPath);
    await fs.mkdir(workspacePath, { recursive: true });
    return workspacePath;
  }

  async updateRepoWorkspacePath(workspaceId: string, customRootPath?: string | null): Promise<string> {
    const workspacePath = this.getRepoWorkspacePath(workspaceId, customRootPath);

    await db.repoWorkspace.update({
      where: { id: workspaceId },
      data: {
        rootPath: customRootPath ?? workspaceId,
      },
    });

    return workspacePath;
  }

  /**
   * Sync database files to the workspace filesystem
   * This ensures the workspace reflects the current DB state
   */
  async syncToDisk(projectId: string): Promise<number> {
    const projectFiles = await db.projectFile.findMany({
      where: { projectId },
    });

    let written = 0;
    for (const file of projectFiles) {
      await this.writeFile(projectId, file.path, file.content);
      written++;
    }

    console.log(`[AION Workspace] Synced ${written} files to disk for project ${projectId}`);
    return written;
  }
}

// Singleton
export const workspaceManager = new WorkspaceManager();
