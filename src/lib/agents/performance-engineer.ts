// AION — Performance Engineer Agent
// Performance profiling, optimization, Core Web Vitals, and load testing.
// "Fast is a feature. Slow is a bug. I measure everything and optimize what matters."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
} from '@/lib/types/aion';
import { workspaceManager } from '@/lib/engine/workspace-manager';
import { commandRunner } from '@/lib/engine/command-runner';

// ============================================================
// THE PERFORMANCE ENGINEER — SPEED IS NEVER AN ACCIDENT
// ============================================================
const PERFORMANCE_SYSTEM_PROMPT = `You are the Performance Engineer Agent of AION. Measure first, optimize second, verify third. Provide specific numbers — not "it's slow" but "LCP is 4.2s, target < 2.5s". Prioritize by impact.

ROLE: Run Lighthouse/Core Web Vitals analysis, profile React renders, analyze bundle size, optimize DB queries/API, implement caching, review images/assets, design lazy loading, generate monitoring code.

TARGETS: Lighthouse 90+, LCP < 2.5s, FID/INP < 100ms, CLS < 0.1, TTFB < 800ms, JS bundle < 200KB gzipped, API P95 < 500ms.

STRATEGIES: Code splitting (dynamic imports, React.lazy), image optimization (WebP, srcset, lazy load), font optimization, SSR/SSG, caching (HTTP headers, stale-while-revalidate, ISR), tree shaking, DB query optimization, API compression/pagination.

FILES: Only write to src/lib/performance/**, next.config updates, caching utilities. Never modify business logic or UI — recommend optimizations.

RULES:
1. Base recommendations on ACTUAL build output and code analysis
2. Provide specific numbers (current vs target)
3. Prioritize by impact (biggest gain first)
4. Explain trade-offs of each optimization
5. Can't claim improvements without evidence
6. Include before/after metrics

OUTPUT JSON:
{"status":"success|failed|needs_clarification","output":{"analysis":"...","files":[{"path":"...","content":"...","action":"create","description":"..."}],"lighthouseEstimate":{"performance":0,"accessibility":0,"bestPractices":0,"seo":0},"coreWebVitals":{"lcp":"...","fid":"...","cls":"...","ttfb":"..."},"bundleAnalysis":{"totalSize":"...","largestChunks":["..."],"recommendations":["..."]},"optimizations":[{"type":"...","description":"...","impact":"high|medium|low","effort":"low|medium|high","before":"...","expectedAfter":"..."}],"statusUpdate":"...","nextSteps":["..."]},"confidence":0.0-1.0}`;

// ============================================================
// INTERFACES
// ============================================================

interface PerformanceOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    files?: FileChange[];
    lighthouseEstimate?: { performance: number; accessibility: number; bestPractices: number; seo: number };
    coreWebVitals?: { lcp: string; fid: string; cls: string; ttfb: string };
    bundleAnalysis?: { totalSize: string; largestChunks: string[]; recommendations: string[] };
    optimizations?: { type: string; description: string; impact: string; effort: string; before: string; expectedAfter: string }[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class PerformanceEngineerAgent extends BaseAgent {
  constructor() {
    super({
      role: 'performance',
      name: 'Performance Engineer',
      systemPrompt: PERFORMANCE_SYSTEM_PROMPT,
      writeAccess: ['fileManifest:performance', 'performanceMetrics', 'agentLog'],
      deniedAccess: ['src/components/**', 'src/app/**/page.tsx', 'deployStatus', 'testResults'],
    });
  }

  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 1: Analyze build output for bundle info
    // ========================================
    let buildAnalysis = '';
    if (projectId) {
      buildAnalysis = await this.analyzeBuild(projectId);
    }

    // ========================================
    // STEP 2: Read source files for performance patterns
    // ========================================
    let sourceAnalysis = '';
    if (projectId) {
      sourceAnalysis = await this.readProjectFiles(projectId);
    }

    // ========================================
    // STEP 3: Check next.config and package.json
    // ========================================
    let configAnalysis = '';
    if (projectId) {
      configAnalysis = await this.analyzeConfigs(projectId);
    }

    // ========================================
    // STEP 4: Build enhanced context with real data
    // ========================================
    const enhancedContext = [
      context,
      buildAnalysis ? `\n\nBUILD ANALYSIS:\n${buildAnalysis}` : '',
      sourceAnalysis ? `\n\nSOURCE CODE ANALYSIS:\n${sourceAnalysis}` : '',
      configAnalysis ? `\n\nCONFIGURATION ANALYSIS:\n${configAnalysis}` : '',
    ].join('');

    const userMessage = `PERFORMANCE ANALYSIS DATA:\n${enhancedContext}\n\nYOUR PERFORMANCE TASK:\n${task}`;

    const result = await this.callAgentAI<PerformanceOutput>(userMessage);

    if (!result.data) {
      return this.createResponse(
        'performance-task',
        'needs_clarification',
        { analysis: 'I had trouble analyzing performance. The build may not be ready for analysis yet.' },
        0.3
      );
    }

    const data = result.data;

    return this.createResponse(
      'performance-task',
      data.status || 'success',
      {
        analysis: data.output?.analysis,
        files: data.output?.files,
        statusUpdate: data.output?.statusUpdate,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  // ============================================================
  // REAL PERFORMANCE SCANS
  // ============================================================

  private async analyzeBuild(projectId: string): Promise<string> {
    try {
      const result = commandRunner.runInWorkspace(projectId, 'npm run build 2>&1 | tail -50 || true', { timeout: 120000 });

      // Extract bundle size info from Next.js build output
      const lines = result.stdout.split('\n');
      const bundleLines = lines.filter(l =>
        l.includes('Route') || l.includes('Size') || l.includes('First Load') || l.includes('├') || l.includes('└')
      );

      if (bundleLines.length > 0) {
        return `NEXT.JS BUILD OUTPUT (bundle sizes):\n${bundleLines.join('\n')}`;
      }

      return `Build output (last 50 lines):\n${result.stdout.substring(result.stdout.length - 3000)}`;
    } catch (error: any) {
      return `Build analysis failed: ${error.message}`;
    }
  }

  private async readProjectFiles(projectId: string): Promise<string> {
    try {
      const files = await workspaceManager.listFiles(projectId);
      const sourceFiles: string[] = [];
      const relevant = files.filter(f =>
        /\.(tsx|ts|jsx|js|css)$/.test(f) &&
        !f.includes('node_modules') &&
        !f.includes('.next')
      );

      // Priority: page files, layouts, and large components
      const priorityFiles = relevant.filter(f =>
        f.includes('page.tsx') || f.includes('layout.tsx') || f.includes('globals.css')
      );

      for (const filePath of priorityFiles.slice(0, 10)) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (content) {
          sourceFiles.push(`\n--- ${filePath} (${content.length} bytes) ---\n${content.substring(0, 2000)}`);
        }
      }

      // Check for performance anti-patterns
      const antiPatterns: string[] = [];
      for (const filePath of relevant.slice(0, 20)) {
        const content = await workspaceManager.readFile(projectId, filePath);
        if (!content) continue;

        if (/import.*from\s+['"]lodash['"]/.test(content)) antiPatterns.push(`${filePath}: Full lodash import (use lodash-es or specific functions)`);
        if (/moment/.test(content)) antiPatterns.push(`${filePath}: Uses moment.js (use date-fns or dayjs instead)`);
        if (/<img\s/.test(content) && !/loading=/.test(content)) antiPatterns.push(`${filePath}: <img> without lazy loading`);
        if (/\.map\(/.test(content) && !/key=/.test(content)) antiPatterns.push(`${filePath}: .map() without key prop`);
        if (/useEffect\(\s*\(\)\s*=>\s*\{[^}]*fetch/.test(content)) antiPatterns.push(`${filePath}: Fetch in useEffect (consider SWR or React Query)`);
        if (/useState.*\[\]/.test(content) && content.length > 5000) antiPatterns.push(`${filePath}: Large component with array state (consider memoization)`);
      }

      const parts: string[] = [];
      if (sourceFiles.length > 0) {
        parts.push(`SOURCE FILES (${priorityFiles.length} analyzed):${sourceFiles.join('\n')}`);
      }
      if (antiPatterns.length > 0) {
        parts.push(`\nPERFORMANCE ANTI-PATTERNS DETECTED (${antiPatterns.length}):`);
        antiPatterns.forEach(p => parts.push(`  - ${p}`));
      }

      return parts.join('\n') || 'No source files found for analysis.';
    } catch (error: any) {
      return `Source analysis error: ${error.message}`;
    }
  }

  private async analyzeConfigs(projectId: string): Promise<string> {
    try {
      const parts: string[] = [];

      const nextConfig = await workspaceManager.readFile(projectId, 'next.config.js') ||
                         await workspaceManager.readFile(projectId, 'next.config.ts') ||
                         await workspaceManager.readFile(projectId, 'next.config.mjs');
      if (nextConfig) {
        parts.push(`NEXT CONFIG:\n${nextConfig}`);
      }

      const packageJson = await workspaceManager.readFile(projectId, 'package.json');
      if (packageJson) {
        try {
          const pkg = JSON.parse(packageJson);
          const depCount = Object.keys(pkg.dependencies || {}).length;
          const devDepCount = Object.keys(pkg.devDependencies || {}).length;
          parts.push(`\nDEPENDENCIES: ${depCount} production, ${devDepCount} dev`);

          // Check for heavy dependencies
          const heavyDeps = ['moment', 'lodash', 'jquery', 'bootstrap', 'antd', '@material-ui'];
          const foundHeavy = heavyDeps.filter(d => pkg.dependencies?.[d]);
          if (foundHeavy.length > 0) {
            parts.push(`HEAVY DEPENDENCIES FOUND: ${foundHeavy.join(', ')} (consider lighter alternatives)`);
          }
        } catch {}
      }

      return parts.join('\n') || 'No config files found.';
    } catch {
      return '';
    }
  }
}
