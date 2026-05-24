// AION — Research Analyst Agent
// Web search, scraping, and intelligence gathering specialist.
// "If it exists on the internet, I'll find it. If someone's doing it better, I'll know."

import { BaseAgent } from './base-agent';
import type {
  AgentResponse,
  FileChange,
  WebSearchResult,
  ScrapedContent,
  ResearchReport,
  CompetitorInsight,
  MarketDataPoint,
  TechnicalReference,
} from '@/lib/types/aion';
import { headlessBrowser } from '@/lib/engine/headless-browser';
import { agentMemory } from '@/lib/engine/agent-memory';
import ZAI from 'z-ai-web-dev-sdk';

// ============================================================
// THE RESEARCH ANALYST — IF IT'S ON THE INTERNET, THEY'LL FIND IT
// ============================================================
const RESEARCH_SYSTEM_PROMPT = `You are the Research Analyst Agent of AION.

You are a senior research analyst with 15+ years of experience in market intelligence, competitive analysis, and technology research. You've worked at McKinsey, Gartner, and three Y Combinator startups. You know that data without context is noise, and assumptions without evidence are dangerous. Every claim you make is backed by a source. Every recommendation comes with a confidence level.

YOUR PERSONALITY:
- You are EVIDENCE-BASED. No claim without a source. No recommendation without data.
- You are THOROUGH. You don't stop at the first search result. You dig deeper, cross-reference, and verify.
- You are STRATEGIC. You don't just find information — you synthesize it into actionable intelligence.
- You are HONEST about uncertainty. If the data is conflicting or thin, you say so. No false precision.
- You are EFFICIENT. You prioritize the most impactful research questions. Perfect is the enemy of good enough.
- You CONNECT dots. You see patterns across sources that others miss.

YOUR ROLE:
- Search the web for real-time information about markets, competitors, and technologies
- Scrape and read website content for detailed analysis
- Build competitor profiles with strengths, weaknesses, and feature comparisons
- Identify market trends and opportunities
- Research technical solutions and API documentation
- Provide evidence-backed recommendations to other agents
- Feed research data into the project pipeline so decisions are data-driven

YOUR TOOLS (YOU ACTUALLY USE THESE):
1. WEB SEARCH: Search the web for real-time results using z-ai-web-dev-sdk
2. WEB READER: Read and extract content from specific URLs
3. AI ANALYSIS: Synthesize research findings into actionable intelligence

RESEARCH WORKFLOW:
1. PARSE the task to identify key research questions
2. SEARCH the web for each research question (multiple queries if needed)
3. SCRAPE the most relevant URLs for detailed content
4. ANALYZE all findings with AI to extract insights
5. REPORT structured findings with sources, confidence, and recommendations

RESEARCH TYPES:
- Market Research: Industry size, trends, growth rates, target demographics
- Competitor Analysis: Who's competing, their features, pricing, strengths/weaknesses
- Technical Research: Frameworks, APIs, libraries, integration approaches
- User Research: User needs, pain points, behavior patterns
- Feasibility Research: Can we build this? What are the technical constraints?

YOUR RULES (ANTI-HALLUCINATION):
1. You ONLY provide information you found through web search or web reading
2. You NEVER fabricate sources, URLs, or data points
3. You CITE every claim with its source URL
4. You MARK uncertain findings with confidence levels
5. You DISTINGUISH between facts and interpretations
6. You NEVER modify code or write files — you provide research data for other agents
7. You ALWAYS include the original search queries so others can reproduce your research
8. If web search fails, you REPORT what you tried and suggest alternatives

OUTPUT FORMAT:
Respond with valid JSON matching this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "output": {
    "analysis": "Executive summary of research findings — be specific, cite sources, include numbers",
    "keyFindings": ["Finding 1 with source", "Finding 2 with source", ...],
    "searchResults": [{ "url": "...", "title": "...", "snippet": "...", "source": "...", "relevanceScore": 0.0-1.0 }],
    "scrapedContent": [{ "url": "...", "title": "...", "content": "...", "wordCount": N }],
    "competitorInsights": [{ "name": "...", "url": "...", "strengths": [...], "weaknesses": [...], "features": [...], "pricing": "..." }],
    "marketData": [{ "metric": "...", "value": "...", "source": "..." }],
    "technicalReferences": [{ "technology": "...", "documentationUrl": "...", "keyCapabilities": [...], "integrationComplexity": "low|medium|high" }],
    "recommendations": ["Specific, actionable recommendations based on evidence"],
    "statusUpdate": "Your message to the CTO and user — what you found, what's notable, what needs attention",
    "nextSteps": ["What should happen next based on your research"]
  },
  "confidence": 0.0-1.0
}`;

// ============================================================
// INTERFACES
// ============================================================

interface ResearchOutput {
  status: 'success' | 'failed' | 'needs_clarification';
  output: {
    analysis?: string;
    keyFindings?: string[];
    searchResults?: WebSearchResult[];
    scrapedContent?: ScrapedContent[];
    competitorInsights?: CompetitorInsight[];
    marketData?: MarketDataPoint[];
    technicalReferences?: TechnicalReference[];
    recommendations?: string[];
    statusUpdate?: string;
    nextSteps?: string[];
  };
  confidence: number;
}

export class ResearchAnalystAgent extends BaseAgent {
  constructor() {
    super({
      role: 'research',
      name: 'Research Analyst',
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      writeAccess: ['researchData', 'marketInsights', 'competitorAnalysis', 'agentLog'],
      deniedAccess: ['fileManifest', 'taskQueue', 'deployStatus'],
    });
  }

  /**
   * MAIN EXECUTE — Full research pipeline with real web search, headless browsing, and scraping
   * Enhanced with: Headless Browser for deep site crawling, Agent Memory for pattern recognition
   */
  async execute(task: string, context: string): Promise<AgentResponse> {
    const projectIdMatch = context.match(/PROJECT:\s*(\S+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : null;

    // ========================================
    // STEP 0: Recall past research memories
    // ========================================
    let memoryContext = '';
    try {
      memoryContext = await agentMemory.buildMemoryContext('research', task);
    } catch (error: any) {
      console.warn('[AION Research] Memory recall failed:', error.message);
    }

    // ========================================
    // STEP 1: Extract research queries from task
    // ========================================
    const queries = this.extractSearchQueries(task, context);

    // ========================================
    // STEP 2: Run real web searches
    // ========================================
    const allSearchResults: WebSearchResult[] = [];

    for (const query of queries.slice(0, 5)) { // Max 5 queries per task
      try {
        const searchResults = await this.webSearch(query);
        allSearchResults.push(...searchResults);
      } catch (error: any) {
        console.error(`[AION Research] Search failed for "${query}":`, error.message);
      }
    }

    // Deduplicate by URL
    const uniqueResults = this.deduplicateResults(allSearchResults);

    // ========================================
    // STEP 3: Use Headless Browser for deep crawling top sites
    // ========================================
    const scrapedContent: ScrapedContent[] = [];
    const topUrls = uniqueResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3); // Deep-crawl top 3 most relevant sites

    if (projectId && topUrls.length > 0) {
      // Use headless browser for structured browsing with link extraction
      try {
        const session = headlessBrowser.createSession(projectId);
        console.log(`[AION Research] Created headless browser session ${session.id} for deep crawling`);

        for (const result of topUrls) {
          try {
            const pageResult = await headlessBrowser.navigate(session.id, result.url, {
              maxContentLength: 8000,
            });

            if (pageResult.success && pageResult.data) {
              const page = pageResult.data as any;
              scrapedContent.push({
                url: result.url,
                title: page.title || result.title,
                content: page.content || '',
                wordCount: page.wordCount || 0,
                scrapedAt: new Date().toISOString(),
              });

              // Follow important links from the page (crawl deeper)
              if (page.links && page.links.length > 0) {
                const relevantLinks = page.links
                  .filter((link: any) => link.href && link.href.startsWith('http'))
                  .slice(0, 3); // Follow top 3 internal links

                for (const link of relevantLinks) {
                  try {
                    const subResult = await headlessBrowser.navigate(session.id, link.href, {
                      maxContentLength: 5000,
                    });
                    if (subResult.success && subResult.data) {
                      const subPage = subResult.data as any;
                      scrapedContent.push({
                        url: link.href,
                        title: subPage.title || link.text || '',
                        content: subPage.content || '',
                        wordCount: subPage.wordCount || 0,
                        scrapedAt: new Date().toISOString(),
                      });
                    }
                  } catch {
                    // Skip failed sub-pages
                  }
                }
              }
            }
          } catch (error: any) {
            console.error(`[AION Research] Headless browse failed for ${result.url}:`, error.message);
            // Fallback to basic scraping
            const content = await this.scrapeUrl(result.url);
            if (content) scrapedContent.push(content);
          }
        }

        // End the session
        headlessBrowser.endSession(session.id);
      } catch (error: any) {
        console.error('[AION Research] Headless browser session failed:', error.message);
        // Fallback to basic scraping for all top URLs
        for (const result of topUrls) {
          try {
            const content = await this.scrapeUrl(result.url);
            if (content) scrapedContent.push(content);
          } catch {}
        }
      }
    } else {
      // No projectId or no top URLs — use basic scraping
      for (const result of topUrls) {
        try {
          const content = await this.scrapeUrl(result.url);
          if (content) scrapedContent.push(content);
        } catch (error: any) {
          console.error(`[AION Research] Scrape failed for ${result.url}:`, error.message);
        }
      }
    }

    // Also scrape remaining top URLs (4-5) with basic scraping
    const remainingUrls = uniqueResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(3, 6);

    for (const result of remainingUrls) {
      try {
        const content = await this.scrapeUrl(result.url);
        if (content) scrapedContent.push(content);
      } catch {}
    }

    // ========================================
    // STEP 4: Build enhanced context with real data + memory
    // ========================================
    const enhancedContext = this.buildResearchContext(context, uniqueResults, scrapedContent, memoryContext);

    // ========================================
    // STEP 5: Send to AI for analysis
    // ========================================
    const userMessage = `RESEARCH DATA (REAL WEB SEARCH RESULTS + SCRAPED CONTENT + PAST MEMORIES):\n${enhancedContext}\n\nYOUR RESEARCH TASK:\n${task}`;

    const result = await this.callAgentAI<ResearchOutput>(userMessage);

    if (!result.data) {
      // Return search results even if AI fails
      return this.createSearchOnlyResponse(uniqueResults, scrapedContent, task);
    }

    const data = result.data;

    // ========================================
    // STEP 6: Store findings in agent memory for future tasks
    // ========================================
    try {
      if (data.output?.keyFindings && data.output.keyFindings.length > 0) {
        await agentMemory.storeMemory({
          agentRole: 'research',
          category: 'task_pattern',
          pattern: `Research on: ${task.substring(0, 100)}`,
          resolution: data.output.keyFindings.slice(0, 5).join('; '),
          confidence: data.confidence || 0.7,
          projectId: projectId || undefined,
        });
      }
      if (data.output?.competitorInsights && data.output.competitorInsights.length > 0) {
        await agentMemory.storeProjectContext(
          projectId || 'global',
          'competitor_insights',
          JSON.stringify(data.output.competitorInsights.slice(0, 5)),
          'research'
        );
      }
    } catch (error: any) {
      console.warn('[AION Research] Memory store failed:', error.message);
    }

    return this.createResponse(
      'research-task',
      data.status === 'needs_clarification' ? 'needs_clarification' : 'success',
      {
        analysis: data.output?.analysis,
        files: undefined,
        statusUpdate: data.output?.statusUpdate || `Research complete: ${uniqueResults.length} sources found, ${scrapedContent.length} pages analyzed.`,
        nextSteps: data.output?.nextSteps,
      },
      data.confidence || 0.7
    );
  }

  // ============================================================
  // WEB SEARCH — Real search via z-ai-web-dev-sdk
  // ============================================================

  private async webSearch(query: string): Promise<WebSearchResult[]> {
    try {
      const zai = await ZAI.create();
      const searchResult = await zai.functions.invoke('web_search', {
        query,
        num: 10,
      });

      if (!Array.isArray(searchResult)) return [];

      return searchResult.map((item: any, index: number) => ({
        url: item.url || '',
        title: item.name || '',
        snippet: item.snippet || '',
        source: item.host_name || new URL(item.url || '').hostname,
        relevanceScore: 1 - (index * 0.08), // Higher ranked = more relevant
      }));
    } catch (error: any) {
      console.error('[AION Research] Web search error:', error.message);
      return [];
    }
  }

  // ============================================================
  // WEB SCRAPING — Read and extract content from URLs
  // ============================================================

  private async scrapeUrl(url: string): Promise<ScrapedContent | null> {
    try {
      const zai = await ZAI.create();
      const result = await zai.functions.invoke('page_reader', { url });

      if (!result || !result.data) return null;

      const pageData = result.data;
      const content = pageData.html || '';
      const title = pageData.title || '';

      // Strip HTML tags for plain text
      const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      return {
        url,
        title,
        content: plainText.substring(0, 5000), // Limit content size
        wordCount: plainText.split(/\s+/).length,
        scrapedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[AION Research] Scrape error for ${url}:`, error.message);
      return null;
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  private extractSearchQueries(task: string, context: string): string[] {
    const queries: string[] = [];

    // Extract the main task as a query
    queries.push(task.substring(0, 200));

    // Look for specific topics in the context
    const topicPatterns = [
      /competitors?\s+(?:for|of|in)\s+([^.?\n]+)/gi,
      /market\s+(?:for|in|size)\s+([^.?\n]+)/gi,
      /research\s+(?:about|on)\s+([^.?\n]+)/gi,
      /how\s+(?:to|does|do)\s+([^.?\n]+)/gi,
      /best\s+([^.?\n]+)/gi,
    ];

    for (const pattern of topicPatterns) {
      let match;
      while ((match = pattern.exec(task + ' ' + context)) !== null) {
        if (match[1]) {
          queries.push(match[1].trim().substring(0, 150));
        }
      }
    }

    // If project name is in context, add it as a query
    const projectMatch = context.match(/PROJECT:\s*(\S+)/);
    if (projectMatch) {
      queries.push(`project ${projectMatch[1]} best practices`);
    }

    // Deduplicate and limit
    return [...new Set(queries)].slice(0, 5);
  }

  private deduplicateResults(results: WebSearchResult[]): WebSearchResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  }

  private buildResearchContext(
    baseContext: string,
    searchResults: WebSearchResult[],
    scrapedContent: ScrapedContent[],
    memoryContext?: string
  ): string {
    const parts: string[] = [baseContext];

    // Add memory context if available
    if (memoryContext && memoryContext.length > 10) {
      parts.push('\n========================================');
      parts.push('PAST RESEARCH MEMORIES (LEARNED FROM PREVIOUS TASKS):');
      parts.push('========================================');
      parts.push(memoryContext);
    }

    if (searchResults.length > 0) {
      parts.push('\n========================================');
      parts.push('WEB SEARCH RESULTS (REAL, FROM z-ai-web-dev-sdk):');
      parts.push('========================================');
      searchResults.slice(0, 20).forEach((result, i) => {
        parts.push(`${i + 1}. [${result.title}](${result.url})`);
        parts.push(`   ${result.snippet}`);
        parts.push(`   Source: ${result.source} | Relevance: ${(result.relevanceScore * 100).toFixed(0)}%`);
      });
    }

    if (scrapedContent.length > 0) {
      parts.push('\n========================================');
      parts.push('SCRAPED PAGE CONTENT (REAL, EXTRACTED FROM URLs):');
      parts.push('========================================');
      for (const page of scrapedContent) {
        parts.push(`\n--- ${page.title} (${page.url}) ---`);
        parts.push(`Word count: ${page.wordCount}`);
        parts.push(page.content.substring(0, 3000));
      }
    }

    if (searchResults.length === 0 && scrapedContent.length === 0) {
      parts.push('\n⚠️ No web search results found. Analyze based on existing context only.');
    }

    return parts.join('\n');
  }

  private createSearchOnlyResponse(
    searchResults: WebSearchResult[],
    scrapedContent: ScrapedContent[],
    task: string
  ): AgentResponse {
    const topResults = searchResults.slice(0, 10).map(r =>
      `- [${r.title}](${r.url}): ${r.snippet}`
    ).join('\n');

    return this.createResponse(
      'research-task',
      searchResults.length > 0 ? 'success' : 'needs_clarification',
      {
        analysis: `Research completed with ${searchResults.length} search results and ${scrapedContent.length} pages scraped. AI analysis unavailable — returning raw search results.`,
        statusUpdate: searchResults.length > 0
          ? `🔍 Found ${searchResults.length} sources for: "${task.substring(0, 60)}". Top results:\n${topResults}`
          : `🔍 No web search results found for: "${task.substring(0, 60)}". Try a different search query.`,
        nextSteps: searchResults.length > 0
          ? ['Review search results', 'Request deeper analysis of specific URLs', 'Share findings with Business Strategist']
          : ['Try a different search query', 'Check if the topic is too niche for web search'],
      },
      searchResults.length > 0 ? 0.6 : 0.3
    );
  }
}
