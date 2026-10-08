/**
 * Magic-link and OAuth return.
 * Exchanges the Supabase code (or token_hash) for a session cookie,
 * then sends the browser into the app. `/` is the marketing page, so a
 * successful sign-in never stops there.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
const AFTER_AUTH = '/onboarding/area?from=general';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type') as EmailOtpType | null;
  const authError = url.searchParams.get('error_description') || url.searchParams.get('error');
  const requested = safeNext(url.searchParams.get('next'));

  const pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const merged = new Map(request.cookies.getAll().map((cookie) => [cookie.name, cookie]));
          pendingCookies.forEach((cookie) => merged.set(cookie.name, { name: cookie.name, value: cookie.value }));
          return [...merged.values()];
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach((cookie) => {
            const index = pendingCookies.findIndex((existing) => existing.name === cookie.name);
            if (index >= 0) pendingCookies[index] = cookie;
            else pendingCookies.push(cookie);
          });
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return signInError(request, error.message);
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) return signInError(request, error.message);
  } else if (authError) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return signInError(request, authError);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return signInError(request, 'This sign-in link was already used or has expired. Request a new one.');
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return signInError(request, 'Sign-in did not complete. Request a new magic link.');

  const destination = requested || AFTER_AUTH;

  const redirect = NextResponse.redirect(new URL(destination, request.url));
  pendingCookies.forEach(({ name, value, options }) => {
    redirect.cookies.set(name, value, options);
  });
  return redirect;
}

function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value === '/' || value === '/signin' || value.startsWith('/signin?')) return null;
  return value;
}

function signInError(request: NextRequest, message: string) {
  const dest = new URL('/signin', request.url);
  dest.searchParams.set('error', message);
  return NextResponse.redirect(dest);
}
