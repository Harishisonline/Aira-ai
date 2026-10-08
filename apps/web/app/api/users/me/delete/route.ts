/**
 * POST /api/users/me/delete — destructive: deletes user, all chat sessions,
 * messages, advisory history, and avatar. Body must include
 * { confirmEmail: "user@example.com" } matching the account email.
 *
 * Hardened for production:
 *   - CSRF header check (X-Requested-With: fetch)
 *   - Rate limit: 3 attempts per hour per user (prevents email-confirm brute force)
 *   - Uses a SECURITY DEFINER RPC (`delete_user`) defined in
 *     apps/worker/app/db/migrations/02_rls_and_helpers.sql.
 *   - Service-role client bypasses RLS for the cascade.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabase } from '../../../../../lib/supabase/route-handler';
import { assertCsrf } from '../../../../../lib/csrf';
import { rateLimit } from '../../../../../lib/rate-limit';

export async function POST(req: NextRequest) {
  // 1. CSRF protection: require the X-Requested-With header
  try {
    assertCsrf(req);
  } catch (r) {
    return r as Response;
  }

  // 2. Auth
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 3. Rate limit (3 per hour per user)
  const rl = rateLimit({ key: `delete:${user.id}`, max: 3, window: 3600 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_s: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  // 4. Email confirmation
  const body = await req.json() as { confirmEmail?: string };
  if (!body.confirmEmail || body.confirmEmail.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return NextResponse.json(
      { error: 'confirmation required: send { confirmEmail: "<your account email>" }' },
      { status: 400 },
    );
  }

  // 5. Service-role client for the cascade
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 6. Best-effort avatar cleanup
  await service.storage.from('avatars').remove([
    `${user.id}/avatar.webp`, `${user.id}/avatar.png`, `${user.id}/avatar.jpg`,
  ]);

  // 7. The actual delete (cascades through all related tables; RLS bypassed)
  const { error: rpcErr } = await service.rpc('delete_user', { p_user_id: user.id });
  if (rpcErr) {
    return NextResponse.json({ error: `delete_user RPC failed: ${rpcErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, redirect: '/' });
}
