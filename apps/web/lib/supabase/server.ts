/**
 * Server-side Supabase client. Use this in Server Components, Route Handlers,
 * and Server Actions. It reads the session from the user's cookies via next/headers.
 *
 * Auth model: Supabase Auth stores session in cookies. We use @supabase/ssr
 * to bridge between the cookie-based session and the @supabase/supabase-js client.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don't crash the entire build; surface the error at request time
  console.warn('[supabase/server] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
}

/**
 * Standard server client. Sets cookies when the session changes (during
 * rendering, the cookies() store is mutable).
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set({ name, value, ...(options as any) });
          });
        } catch {
          // Called from a Server Component (read-only context). Safe to ignore —
          // middleware will refresh the session cookie instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS. Use ONLY in server-side code that
 * needs admin access (e.g. /api/users/me/delete which calls a SECURITY
 * DEFINER RPC). Never expose this to the browser.
 */
export function createServiceClient(): SupabaseClient {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  // Lazy import keeps the anon-key client bundle smaller
  const { createClient: baseCreate } = require('@supabase/supabase-js');
  return baseCreate(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}