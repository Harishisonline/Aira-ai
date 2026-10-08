/**
 * Lightweight CSRF protection for state-changing routes.
 *
 * Aira uses Supabase's httpOnly cookie session, so most XSRF vectors
 * are already mitigated (the cookie isn't readable by JS). But for
 * defense in depth on destructive routes (delete account, sign out
 * everywhere, change password), we require a custom header that an
 * attacker on a different origin can't set:
 *
 *   X-Requested-With: fetch
 *
 * This is the same pattern Next.js docs recommend. Combined with
 * SameSite=Lax cookies (Supabase's default), it blocks cross-site
 * form submissions.
 *
 * Use as: `assertCsrf(req)` at the top of any state-changing route.
 * Throws Response(403) if the header is missing.
 */

import { NextRequest } from 'next/server';

export function assertCsrf(req: NextRequest): void {
  const hdr = req.headers.get('x-requested-with');
  if (hdr !== 'fetch' && hdr !== 'XMLHttpRequest') {
    throw new Response(
      JSON.stringify({ error: 'csrf_protection_missing_header' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
  }
}
