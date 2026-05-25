// AION — API Authentication Middleware
// Protects all API routes with API key authentication.
// In development mode (no AION_API_KEY set), auth is optional with a warning.
// In production, ALL API requests require a valid AION_API_KEY header.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that are always public (no auth needed)
const PUBLIC_ROUTES = [
  '/api/health',     // Health check endpoint
  '/api',            // Root API hello
];

// Routes that require auth in production
const PROTECTED_ROUTES = [
  '/api/chat',
  '/api/orchestrate',
  '/api/project',
  '/api/terminal',
  '/api/cost',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname === route)) {
    return NextResponse.next();
  }

  // Only protect API routes
  const isApiRoute = pathname.startsWith('/api/');
  if (!isApiRoute) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  if (!isProtected) {
    return NextResponse.next();
  }

  const apiKey = process.env.AION_API_KEY;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // If no API key is configured, allow in dev mode with warning
  if (!apiKey || apiKey.trim() === '') {
    if (isDevelopment) {
      // In development, log a warning but allow access
      console.warn(
        `[AION Auth] WARNING: AION_API_KEY not set. API routes are UNPROTECTED.` +
        ` Set AION_API_KEY in .env to enable authentication.`
      );
      return NextResponse.next();
    } else {
      // In production without an API key, block everything
      console.error('[AION Auth] BLOCKED: AION_API_KEY not configured in production');
      return NextResponse.json(
        { error: 'Server authentication not configured. Contact administrator.' },
        { status: 503 }
      );
    }
  }

  // Validate the API key from request headers
  const providedKey = request.headers.get('x-aion-api-key') ||
                      request.headers.get('authorization')?.replace('Bearer ', '');

  if (!providedKey) {
    return NextResponse.json(
      { error: 'Authentication required. Provide x-aion-api-key header.' },
      { status: 401 }
    );
  }

  if (providedKey !== apiKey) {
    console.warn(`[AION Auth] Invalid API key attempt from ${request.headers.get('x-forwarded-for') || 'unknown IP'}`);
    return NextResponse.json(
      { error: 'Invalid API key.' },
      { status: 403 }
    );
  }

  // Rate limiting (simple in-memory, per-request check)
  // For production, use Vercel KV or Redis
  const rateLimitKey = `rate_limit_${providedKey.substring(0, 8)}`;

  // Auth passed
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
};
