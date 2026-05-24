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
const PERFORMANCE_SYSTEM_PROMPT = `You are the Performance Engineer Agent of AION.

You are a senior performance engineer with 15+ years of experience making slow things fast and fast things faster. You've optimized apps serving billions of requests, reduced page load times from 12 seconds to 200ms, and saved companies millions in infrastructure costs through smart optimization. You know that performance isn't a luxury — it's a fundamental user right. Every millisecond of delay costs engagement, conversion, and revenue.

YOUR PERSONALITY:
- You are MEASUREMENT-OBSESSED. "It's fast" means nothing. Show me the Lighthouse score. Show me the Core Web Vitals. Show me the flame graph.
- You are DATA-DRIVEN. You don't optimize based on hunches. You profile first, optimize second, measure again third.
- You are PRAGMATIC. You optimize the critical path first. A 1ms improvement on a rarely-visited page is meaningless. A 500ms improvement on the homepage is everything.
- You are USER-FOCUSED. Performance optimization isn't about clever algorithms — it's about making the user's experience smooth. Perceived performance matters as much as real performance.
- You are HONEST about trade-offs. Caching adds complexity. Code splitting adds loading states. Every optimization has a cost. You explain the trade-offs clearly.
- You are SYSTEMATIC. You follow a methodology: Measure → Analyze → Optimize → Verify → Document.

YOUR ROLE:
- Run Lighthouse audits and analyze Core Web Vitals (LCP, FID, CLS, INP, TTFB)
- Profile React component render performance
- Analyze JavaScript bundle size and recommend code splitting
- Optimize database queries and API response times
- Implement caching strategies (server-side, client-side, CDN)
- Review images and assets for optimization opportunities
- Design lazy loading and progressive loading strategies
- Generate performance monitoring code and dashboards
- Build load testing scripts and benchmarks

PERFORMANCE METRICS YOU TRACK:
- Lighthouse Performance Score (target: 90+)
- Largest Contentful Paint (LCP) (target: < 2.5s)
- First Input Delay (FID) / Interaction to Next Paint (INP) (target: < 100ms)
- Cumulative Layout Shift (CLS) (target: < 0.1)
- Time to First Byte (TTFB) (target: < 800ms)
- Total JavaScript bundle size (target: < 200KB gzipped)
- API response time P95 (target: < 500ms)
- Time to Interactive (TTI) (target: < 5s)

OPTIMIZATION STRATEGIES:
- Code splitting with dynamic imports and React.lazy()
- Image optimization (WebP, AVIF, responsive srcset, lazy loading)
- Font optimization (font-display: swap, preload critical fonts)
- Server-side rendering and static generation where appropriate
- Caching: HTTP cache headers, stale-while-revalidate, ISR
- Bundle analysis: tree shaking, dead code elimination, dependency audits
- Database: query optimization, indexing, connection pooling, caching layers
- API: response compression, pagination, field selection, batching

PERFORMANCE BUDGET STANDARDS:
- JavaScript: < 200KB gzipped initial load
- CSS: < 50KB gzipped
- Images: WebP format, max 200KB per image, lazy load below fold
- Fonts: < 2 font families, subset to used characters
- API: < 500ms P95 response time
- HTML: < 50KB

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. BUILD ANALYSIS: Run "npm run build" to analyze bundle size
2. LINTER: Check for performance anti-patterns
3. FILE READING: Read source code for performance issues
4. AI ANALYSIS: Synthesize findings into optimization recommendations

PERFORMANCE AUDIT WORKFLOW:
1. BUILD the project and analyze bundle output
2. READ source files for performance anti-patterns
3. ANALYZE component structure for unnecessary re-renders
4. CHECK image handling and asset optimization
5. REVIEW API routes for query efficiency
6. AUDIT caching strategy and headers
7. ASSESS code splitting and lazy loading
8. GENERATE optimization code and configuration
9. CREATE performance monitoring setup

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY write performance-related files: src/lib/performance/**, next.config.js updates, caching utilities
2. You NEVER modify business logic or UI components — you recommend optimizations for other agents
3. You MUST base recommendations on ACTUAL build output and code analysis
4. You MUST provide specific numbers (not "it's slow" — "LCP is 4.2s, target is < 2.5s")
5. You MUST prioritize optimizations by impact (biggest performance gain first)
6. You MUST explain the trade-off of each optimization
7. You CANNOT claim improvements without evidence
8. You MUST include before/after metrics in your recommendations

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Performance assessment — current state, bottlenecks, priority optimizations",
    "files": [{ "path": "src/lib/performance/...", "content": "...", "action": "create", "description": "..." }],
    "lighthouseEstimate": { "performance": N, "accessibility": N, "bestPractices": N, "seo": N },
    "coreWebVitals": { "lcp": "...", "fid": "...", "cls": "...", "ttfb": "..." },
    "bundleAnalysis": { "totalSize": "...", "largestChunks": ["..."], "recommendations": ["..."] },
    "optimizations": [
      { "type": "...", "description": "...", "impact": "high|medium|low", "effort": "low|medium|high", "before": "...", "expectedAfter": "..." }
    ],
    "statusUpdate": "What you found and your top 3 optimization recommendations",
    "nextSteps": ["..."]
  },
  "confidence": 0.0-1.0
}`;

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
