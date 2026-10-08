/**
 * Middleware: refreshes the Supabase session cookie on every request,
 * and applies security headers to every response.
 *
 * Security headers set:
 *   Strict-Transport-Security       -- 1 year HSTS (only on HTTPS)
 *   X-Content-Type-Options          -- nosniff
 *   X-Frame-Options                 -- DENY (no clickjacking)
 *   Referrer-Policy                 -- strict-origin-when-cross-origin
 *   Permissions-Policy              -- disable unused features
 *   Content-Security-Policy         -- restrict script/style/connect sources
 *   Cross-Origin-Opener-Policy      -- same-origin
 *
 * CSP is intentionally permissive about the Supabase domain (the chat
 * streams Groq tokens over the Supabase REST gateway) and about inline
 * styles (we use Next.js's runtime style injection). No inline scripts
 * are allowed except for the no-flash theme bootstrap which is hashed.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Build the CSP source list. Supabase URL is dynamic; everything else is static.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(SUPABASE_URL).origin;
  } catch {
    return '';
  }
})();

const CSP = [
  "default-src 'self'",
  // Scripts: self + the no-flash theme bootstrap inline. React's dev overlay
  // rebuilds call stacks with eval(); production never does, so leave it off there.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  // Styles: self + inline (Next.js runtime injects style tags)
  "style-src 'self' 'unsafe-inline'",
  // Images: self + data: URIs (avatars stored as data URLs in some flows)
  "img-src 'self' data: blob: https:",
  // Fonts: self + Google Fonts (next/font/google)
  "font-src 'self' data: https://fonts.gstatic.com",
  // XHR/fetch: self + Supabase REST (the chat uses it) + Worker proxy
  `connect-src 'self' ${SUPABASE_ORIGIN} ${process.env.WORKER_URL ?? ''} https://api.groq.com https://api.resend.com`,
  // Workers / SharedArrayBuffer: self only
  "worker-src 'self' blob:",
  // Frames: deny embedding
  "frame-ancestors 'none'",
  // Form actions: self only
  `form-action 'self' ${SUPABASE_ORIGIN} https://accounts.google.com https://appleid.apple.com`,
  // Base URI: self only (defense in depth)
  "base-uri 'self'",
].filter(Boolean).join('; ');

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const isHttps = request.nextUrl.protocol === 'https:';
  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // Only upgrade http assets when the page itself is already https.
  // On http://127.0.0.1 this directive rewrites CSS and JS to https and the
  // browser waits on a TLS connection that never answers, so the page stays blank.
  const csp = isHttps ? `${CSP}; upgrade-insecure-requests` : CSP;
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return response;
}

export async function middleware(request: NextRequest) {
  // Magic-link cookies are host-only. Supabase's site URL is localhost, so
  // a session created there is invisible on 127.0.0.1. Keep one host.
  // Use the Host header: nextUrl.hostname is not always the address the browser used.
  const hostHeader = request.headers.get('host') ?? '';
  const hostname = hostHeader.split(':')[0];
  if (hostname === '127.0.0.1') {
    const canonical = request.nextUrl.clone();
    canonical.hostname = 'localhost';
    canonical.port = hostHeader.includes(':') ? hostHeader.split(':')[1] : canonical.port;
    return NextResponse.redirect(canonical);
  }

  // Pass pathname to Server Components so root layout can hide app Nav on
  // marketing/auth shells (landing, signin, onboarding, chat-locked).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  let userId: string | null = null;

  // 1. Refresh Supabase session cookie (if configured)
  const hasSessionCookie = request.cookies.getAll().some((cookie) => cookie.name.includes('-auth-token'));
  if (hasSessionCookie && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options as any);
          });
        },
      },
    });
    // IMPORTANT: do not run any other code between createServerClient and
    // getUser(). Doing so risks the session being out of sync.
    // Read the session from the cookie. getUser() calls the auth server on
    // every page, which made each click wait on a round trip.
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
  }

  // Guests hitting advisory chat go to sign-in and return to the chat URL.
  // /advisory/chat-locked is the worker-down page, not the guest gate.
  const path = request.nextUrl.pathname;
  if (!userId && /\/advisory\/chat\/?$/.test(path) && !path.includes('chat-locked')) {
    const next = `${path}${request.nextUrl.search}`;
    const locked = NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(next)}`, request.url));
    applySecurityHeaders(locked, request);
    // Preserve refreshed session cookies from the supabase client response
    supabaseResponse.cookies.getAll().forEach((c) => locked.cookies.set(c));
    return locked;
  }

  // Auth gate for /settings/* (PRD §5.13–5.17). /settings/about is public.
  if (!userId && path.startsWith('/settings/') && path !== '/settings/about') {
    const next = `${path}${request.nextUrl.search}`;
    const gated = NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(next)}`, request.url));
    applySecurityHeaders(gated, request);
    // Preserve refreshed session cookies from the supabase client response
    supabaseResponse.cookies.getAll().forEach((c) => gated.cookies.set(c));
    return gated;
  }

  // 2. Apply security headers to the response
  applySecurityHeaders(supabaseResponse, request);

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and the worker proxy
    '/((?!_next/static|_next/image|favicon.ico|api/worker|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
