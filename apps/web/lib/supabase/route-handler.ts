/**
 * Shared helper for API route handlers: creates a Supabase server client
 * with proper Next.js 15 cookie handling (cookies() is async, getAll/setAll).
 *
 * Usage:
 *   const { supabase, cookieStore } = await getServerSupabase();
 *   ...
 *
 * Always await this helper in route handlers — even GET endpoints that
 * don't mutate cookies.
 */

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function getServerSupabase(): Promise<{
  supabase: SupabaseClient;
}> {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set({ name, value, ...(options as any) }));
        } catch {
          // Called from a Server Component (read-only context).
        }
      },
    },
  });
  return { supabase };
}