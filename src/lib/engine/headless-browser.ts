// AION — Headless Browser Engine
// Enables agents to browse websites, read content, extract links, and crawl sites.
// Uses z-ai-web-dev-sdk's page_reader for web page reading.

import ZAI from 'z-ai-web-dev-sdk';

// ============================================================
// EXPORTED TYPES
// ============================================================

export interface BrowserSession {
  id: string;
  projectId: string;
  startedAt: string;
  pagesVisited: number;
  urlsVisited: string[];
}

export interface BrowserPage {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  links: { text: string; href: string }[];
  headings: string[];
  metadata: Record<string, string>;
  loadedAt: string;
  loadTimeMs: number;
}

export type BrowserActionType = 'navigate' | 'read' | 'extract_links' | 'fill_form' | 'screenshot';

export interface BrowserAction {
  type: BrowserActionType;
  url?: string;
  selector?: string;
  value?: string;
}

export interface BrowserResult {
  success: boolean;
  action: BrowserAction;
  data?: BrowserPage | string | string[];
  error?: string;
  duration: number;
}

export interface BrowseOptions {
  maxPages?: number;
  maxDepth?: number;
  stayOnDomain?: boolean;
  delayBetweenPages?: number;
  extractLinks?: boolean;
  maxContentLength?: number;
}

// ============================================================
// INTERNAL TYPES
// ============================================================

interface RobotsRule {
  path: string;
  allow: boolean;
}

interface ParsedRobotsTxt {
  allowed: RobotsRule[];
  disallowed: RobotsRule[];
  sitemaps: string[];
  crawlDelay?: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const RATE_LIMIT_MS = 2000; // Max 1 request per 2 seconds
const MAX_PAGES_PER_SESSION = 50;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_DELAY_BETWEEN_PAGES = 2000;
const DEFAULT_MAX_CONTENT_LENGTH = 50000;

// ============================================================
// HEADLESS BROWSER CLASS
// ============================================================

export class HeadlessBrowser {
  private sessions: Map<string, BrowserSession> = new Map();
  private lastRequestTime: number = 0;
  private robotsCache: Map<string, ParsedRobotsTxt> = new Map();
  private zaiInstance: ZAI | null = null;

  // ============================================================
  // ZAI INSTANCE MANAGEMENT
  // ============================================================

  private async getZAI(): Promise<ZAI> {
    if (!this.zaiInstance) {
      this.zaiInstance = await ZAI.create();
    }
    return this.zaiInstance;
  }

  // ============================================================
  // RATE LIMITING
  // ============================================================

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      const waitTime = RATE_LIMIT_MS - elapsed;
      await this.sleep(waitTime);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // ROBOTS.TXT HANDLING
  // ============================================================

  private async fetchAndParseRobotsTxt(baseUrl: string): Promise<ParsedRobotsTxt> {
    const domain = this.getDomain(baseUrl);
    if (this.robotsCache.has(domain)) {
      return this.robotsCache.get(domain)!;
    }

    const robotsUrl = `${this.getOrigin(baseUrl)}/robots.txt`;
    const parsed: ParsedRobotsTxt = { allowed: [], disallowed: [], sitemaps: [] };

    try {
      const zai = await this.getZAI();
      const result = await zai.functions.invoke('page_reader', { url: robotsUrl });

      if (result && result.data) {
        const rawContent = result.data.html || '';
        const text = this.stripHtml(rawContent);
        this.parseRobotsTxtText(text, parsed);
      }
    } catch {
      // If robots.txt cannot be fetched, assume all allowed
      // This is the standard web behavior — missing robots.txt = allow all
    }

    this.robotsCache.set(domain, parsed);
    return parsed;
  }

  private parseRobotsTxtText(text: string, parsed: ParsedRobotsTxt): void {
    const lines = text.split('\n').map(l => l.trim());
    let isRelevantUserAgent = false;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Check User-agent lines
      if (lowerLine.startsWith('user-agent:')) {
        const agent = lowerLine.substring('user-agent:'.length).trim();
        // We care about '*' (all agents) and 'aion' or similar
        isRelevantUserAgent = agent === '*' || agent === 'aion' || agent === 'aionbot';
        continue;
      }

      if (!isRelevantUserAgent) continue;

      if (lowerLine.startsWith('allow:')) {
        const path = line.substring('allow:'.length).trim();
        parsed.allowed.push({ path, allow: true });
      } else if (lowerLine.startsWith('disallow:')) {
        const path = line.substring('disallow:'.length).trim();
        if (path.length > 0) {
          parsed.disallowed.push({ path, allow: false });
        }
      } else if (lowerLine.startsWith('sitemap:')) {
        const sitemap = line.substring('sitemap:'.length).trim();
        parsed.sitemaps.push(sitemap);
      } else if (lowerLine.startsWith('crawl-delay:')) {
        const delay = parseInt(line.substring('crawl-delay:'.length).trim(), 10);
        if (!isNaN(delay)) {
          parsed.crawlDelay = delay * 1000; // Convert to ms
        }
      }
    }
  }

  private isUrlAllowed(url: string, robots: ParsedRobotsTxt): boolean {
    const pathname = this.getPathname(url);

    // Check disallow rules first
    for (const rule of robots.disallowed) {
      if (this.pathMatchesRule(pathname, rule.path)) {
        // Check if there's a more specific allow rule that overrides
        const overridden = robots.allowed.some(
          allowRule => this.pathMatchesRule(pathname, allowRule.path) && allowRule.path.length >= rule.path.length
        );
        if (!overridden) {
          return false;
        }
      }
    }

    return true;
  }

  private pathMatchesRule(pathname: string, rulePath: string): boolean {
    if (rulePath === '/') return true;
    if (rulePath.endsWith('*')) {
      return pathname.startsWith(rulePath.slice(0, -1));
    }
    return pathname.startsWith(rulePath);
  }

  // ============================================================
  // URL UTILITIES
  // ============================================================

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private getOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }

  private getPathname(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return '/';
    }
  }

  private isSameDomain(url1: string, url2: string): boolean {
    return this.getDomain(url1) === this.getDomain(url2);
  }

  private resolveUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash, hash, and common tracking params
      parsed.hash = '';
      parsed.searchParams.delete('utm_source');
      parsed.searchParams.delete('utm_medium');
      parsed.searchParams.delete('utm_campaign');
      parsed.searchParams.delete('utm_content');
      parsed.searchParams.delete('utm_term');
      parsed.searchParams.delete('fbclid');
      parsed.searchParams.delete('gclid');
      let normalized = parsed.href;
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  // ============================================================
  // HTML PROCESSING
  // ============================================================

  private stripHtml(html: string): string {
    return html
      // Remove script and style blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      // Replace block elements with newlines
      .replace(/<\/?(p|div|br|h[1-6]|li|tr|hr|blockquote|section|article|header|footer|nav|aside|main|figure|figcaption|details|summary|pre)[^>]*>/gi, '\n')
      // Remove all remaining HTML tags
      .replace(/<[^>]*>/g, ' ')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '…')
      // Collapse whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      return this.stripHtml(titleMatch[1]).trim();
    }
    // Fallback to og:title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["'][^>]*>/i);
    if (ogMatch) {
      return ogMatch[1].trim();
    }
    return '';
  }

  private extractMetadata(html: string): Record<string, string> {
    const metadata: Record<string, string> = {};

    // Extract standard meta tags
    const metaPatterns: [string, RegExp][] = [
      ['description', /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['description', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i],
      ['keywords', /<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['keywords', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']keywords["'][^>]*>/i],
      ['author', /<meta[^>]*name=["']author["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['author', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']author["'][^>]*>/i],
      ['og:title', /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:title', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["'][^>]*>/i],
      ['og:description', /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:description', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["'][^>]*>/i],
      ['og:image', /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:image', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i],
      ['og:type', /<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:type', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:type["'][^>]*>/i],
      ['og:url', /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:url', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:url["'][^>]*>/i],
      ['og:site_name', /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['og:site_name', /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["'][^>]*>/i],
      ['twitter:card', /<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['twitter:card', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:card["'][^>]*>/i],
      ['twitter:title', /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['twitter:title', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:title["'][^>]*>/i],
      ['twitter:description', /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["'][^>]*>/i],
      ['twitter:description', /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:description["'][^>]*>/i],
      ['canonical', /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i],
      ['canonical', /<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i],
    ];

    for (const [key, pattern] of metaPatterns) {
      if (!metadata[key]) {
        const match = html.match(pattern);
        if (match && match[1]) {
          metadata[key] = match[1].trim();
        }
      }
    }

    // Extract charset
    const charsetMatch = html.match(/<meta[^>]*charset=["']?([^"'\s>]+)["']?[^>]*>/i);
    if (charsetMatch) {
      metadata.charset = charsetMatch[1].trim();
    }

    return metadata;
  }

  private extractHeadings(html: string): string[] {
    const headings: string[] = [];
    const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match;

    while ((match = headingRegex.exec(html)) !== null) {
      const level = parseInt(match[1], 10);
      const text = this.stripHtml(match[2]).trim();
      if (text) {
        const prefix = '#'.repeat(level);
        headings.push(`${prefix} ${text}`);
      }
    }

    return headings;
  }

  // ============================================================
  // LINK EXTRACTION
  // ============================================================

  extractLinks(content: string, baseUrl: string): { text: string; href: string }[] {
    const links: { text: string; href: string }[] = [];
    const seenHrefs = new Set<string>();

    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const rawHref = match[1];
      const rawText = this.stripHtml(match[2]).trim();

      // Skip empty, javascript, anchor-only, and mailto links
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
        continue;
      }

      // Resolve relative URLs
      const resolvedHref = this.resolveUrl(baseUrl, rawHref);

      // Normalize and deduplicate
      const normalizedHref = this.normalizeUrl(resolvedHref);
      if (seenHrefs.has(normalizedHref)) continue;
      seenHrefs.add(normalizedHref);

      // Only include http/https links
      if (!normalizedHref.startsWith('http://') && !normalizedHref.startsWith('https://')) {
        continue;
      }

      links.push({
        text: rawText || normalizedHref,
        href: normalizedHref,
      });
    }

    return links;
  }

  // ============================================================
  // PAGE READING (CORE)
  // ============================================================

  private async fetchPage(url: string, maxContentLength: number = DEFAULT_MAX_CONTENT_LENGTH): Promise<BrowserPage> {
    const startTime = Date.now();

    // Enforce rate limiting
    await this.enforceRateLimit();

    // Check robots.txt
    const robots = await this.fetchAndParseRobotsTxt(url);
    if (!this.isUrlAllowed(url, robots)) {
      throw new Error(`URL blocked by robots.txt: ${url}`);
    }

    // Apply crawl delay from robots.txt if specified
    if (robots.crawlDelay && robots.crawlDelay > RATE_LIMIT_MS) {
      await this.sleep(robots.crawlDelay - RATE_LIMIT_MS);
    }

    // Fetch the page using z-ai-web-dev-sdk
    const zai = await this.getZAI();
    const result = await zai.functions.invoke('page_reader', { url });

    if (!result || !result.data) {
      throw new Error(`Failed to read page: ${url}`);
    }

    const pageData = result.data;
    const rawHtml = pageData.html || '';
    const pageTitle = pageData.title || this.extractTitle(rawHtml) || url;

    // Process content
    const cleanContent = this.stripHtml(rawHtml);
    const truncatedContent = cleanContent.length > maxContentLength
      ? cleanContent.substring(0, maxContentLength) + '\n\n[Content truncated at ' + maxContentLength + ' characters]'
      : cleanContent;

    const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
    const links = this.extractLinks(rawHtml, url);
    const headings = this.extractHeadings(rawHtml);
    const metadata = this.extractMetadata(rawHtml);

    // Ensure title is in metadata
    if (!metadata.title) {
      metadata.title = pageTitle;
    }

    const loadTimeMs = Date.now() - startTime;

    return {
      url,
      title: pageTitle,
      content: truncatedContent,
      wordCount,
      links,
      headings,
      metadata,
      loadedAt: new Date().toISOString(),
      loadTimeMs,
    };
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================

  createSession(projectId: string): BrowserSession {
    const session: BrowserSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      projectId,
      startedAt: new Date().toISOString(),
      pagesVisited: 0,
      urlsVisited: [],
    };

    this.sessions.set(session.id, session);
    return session;
  }

  endSession(sessionId: string): BrowserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const summary = { ...session };
    this.sessions.delete(sessionId);
    return summary;
  }

  getSession(sessionId: string): BrowserSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getProjectSessions(projectId: string): BrowserSession[] {
    const projectSessions: BrowserSession[] = [];
    this.sessions.forEach((session) => {
      if (session.projectId === projectId) {
        projectSessions.push(session);
      }
    });
    return projectSessions;
  }

  // ============================================================
  // BROWSE ACTIONS
  // ============================================================

  async navigate(sessionId: string, url: string, options?: BrowseOptions): Promise<BrowserResult> {
    const startTime = Date.now();
    const action: BrowserAction = { type: 'navigate', url };

    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        action,
        error: `Session not found: ${sessionId}`,
        duration: Date.now() - startTime,
      };
    }

    if (session.pagesVisited >= MAX_PAGES_PER_SESSION) {
      return {
        success: false,
        action,
        error: `Session page limit reached (${MAX_PAGES_PER_SESSION} pages)`,
        duration: Date.now() - startTime,
      };
    }

    // Check if URL already visited in this session
    const normalizedUrl = this.normalizeUrl(url);
    if (session.urlsVisited.includes(normalizedUrl)) {
      return {
        success: false,
        action,
        error: `URL already visited in this session: ${normalizedUrl}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const page = await this.fetchPage(url, options?.maxContentLength);

      // Update session
      session.pagesVisited++;
      session.urlsVisited.push(normalizedUrl);

      return {
        success: true,
        action,
        data: page,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        action,
        error: error.message || 'Unknown error navigating to URL',
        duration: Date.now() - startTime,
      };
    }
  }

  async readPage(url: string, maxContentLength?: number): Promise<BrowserResult> {
    const startTime = Date.now();
    const action: BrowserAction = { type: 'read', url };

    try {
      const page = await this.fetchPage(url, maxContentLength || DEFAULT_MAX_CONTENT_LENGTH);

      return {
        success: true,
        action,
        data: page,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        action,
        error: error.message || 'Unknown error reading page',
        duration: Date.now() - startTime,
      };
    }
  }

  async extractLinksFromPage(url: string): Promise<BrowserResult> {
    const startTime = Date.now();
    const action: BrowserAction = { type: 'extract_links', url };

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      const zai = await this.getZAI();
      const result = await zai.functions.invoke('page_reader', { url });

      if (!result || !result.data) {
        throw new Error(`Failed to read page: ${url}`);
      }

      const rawHtml = result.data.html || '';
      const links = this.extractLinks(rawHtml, url);

      return {
        success: true,
        action,
        data: links.map(l => l.href),
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        action,
        error: error.message || 'Unknown error extracting links',
        duration: Date.now() - startTime,
      };
    }
  }

  fillForm(url: string, fields: Record<string, string>): BrowserResult {
    const startTime = Date.now();
    const action: BrowserAction = { type: 'fill_form', url };

    // Since we cannot actually interact with forms in headless mode without Playwright,
    // we return structured instructions that the calling agent can use to understand
    // what needs to happen. This is a design decision: the headless browser reads content
    // and provides information; actual form filling would require a browser automation tool.
    const fieldEntries = Object.entries(fields);
    const instructions = [
      `FORM FILL INSTRUCTION for ${url}`,
      '',
      'The following form fields need to be filled:',
      ...fieldEntries.map(([selector, value]) => `  - Field "${selector}": "${value}"`),
      '',
      'NOTE: This headless browser cannot interact with forms directly.',
      'To fill this form, you would need to:',
      '1. Navigate to the URL in a real browser',
      '2. Locate each form field by its selector or name',
      '3. Enter the specified values',
      '4. Submit the form',
      '',
      'Alternatively, if the form submits via GET/POST, you can construct the URL directly:',
      `  ${url}?${fieldEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`,
    ];

    return {
      success: true,
      action,
      data: instructions.join('\n'),
      duration: Date.now() - startTime,
    };
  }

  takeScreenshot(url: string): BrowserResult {
    const startTime = Date.now();
    const action: BrowserAction = { type: 'screenshot', url };

    // The page_reader API doesn't support screenshots.
    // Return metadata about the page that would be useful for a screenshot description.
    return {
      success: true,
      action,
      data: `Screenshot metadata for ${url}:\n` +
        `  - Note: Actual screenshot capture requires a browser automation tool (e.g., Playwright)\n` +
        `  - Use readPage() to get the full page content and metadata\n` +
        `  - The page title, headings, and layout can be inferred from the BrowserPage output`,
      duration: Date.now() - startTime,
    };
  }

  // ============================================================
  // SITE CRAWLING
  // ============================================================

  async crawlSite(startUrl: string, options: BrowseOptions = {}): Promise<{
    pages: BrowserPage[];
    errors: { url: string; error: string }[];
    totalPages: number;
    totalDuration: number;
  }> {
    const {
      maxPages = DEFAULT_MAX_PAGES,
      maxDepth = DEFAULT_MAX_DEPTH,
      stayOnDomain = true,
      delayBetweenPages = DEFAULT_DELAY_BETWEEN_PAGES,
      extractLinks = true,
      maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
    } = options;

    const crawlStart = Date.now();
    const pages: BrowserPage[] = [];
    const errors: { url: string; error: string }[] = [];
    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];

    const startDomain = this.getDomain(startUrl);

    // Fetch robots.txt once for the starting domain
    const robots = await this.fetchAndParseRobotsTxt(startUrl);

    while (queue.length > 0 && pages.length < maxPages) {
      const item = queue.shift()!;

      if (item.depth > maxDepth) continue;

      const normalizedUrl = this.normalizeUrl(item.url);
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      // Check domain restriction
      if (stayOnDomain && this.getDomain(item.url) !== startDomain) {
        continue;
      }

      // Check robots.txt
      if (!this.isUrlAllowed(item.url, robots)) {
        continue;
      }

      try {
        const page = await this.fetchPage(item.url, maxContentLength);
        pages.push(page);

        // Extract and queue follow-up links
        if (extractLinks && item.depth < maxDepth) {
          for (const link of page.links) {
            const linkNormalized = this.normalizeUrl(link.href);
            if (!visited.has(linkNormalized)) {
              queue.push({ url: link.href, depth: item.depth + 1 });
            }
          }
        }

        // Rate limiting between pages
        if (delayBetweenPages > 0 && queue.length > 0) {
          await this.sleep(delayBetweenPages);
        }
      } catch (error: any) {
        errors.push({ url: item.url, error: error.message || 'Unknown error' });
      }
    }

    return {
      pages,
      errors,
      totalPages: pages.length,
      totalDuration: Date.now() - crawlStart,
    };
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Clear the robots.txt cache (useful for long-running sessions)
   */
  clearRobotsCache(): void {
    this.robotsCache.clear();
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up stale sessions (older than 1 hour)
   */
  cleanupStaleSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    const idsToRemove: string[] = [];
    this.sessions.forEach((session, id) => {
      const sessionAge = now - new Date(session.startedAt).getTime();
      if (sessionAge > maxAgeMs) {
        idsToRemove.push(id);
      }
    });
    for (const id of idsToRemove) {
      this.sessions.delete(id);
      cleaned++;
    }

    return cleaned;
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const headlessBrowser = new HeadlessBrowser();
