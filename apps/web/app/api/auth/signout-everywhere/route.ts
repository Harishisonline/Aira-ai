/**
 * POST /api/auth/signout-everywhere — calls supabase.auth.signOut with
 * scope='global' to clear all sessions for this user. After this returns
 * successfully, the client redirects to /.
 *
 * CSRF-protected: a cross-site form can't set the X-Requested-With header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase/route-handler';
import { assertCsrf } from '../../../../lib/csrf';

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
  } catch (r) {
    return r as Response;
  }
  const { supabase } = await getServerSupabase();
  await supabase.auth.signOut({ scope: 'global' });
  return NextResponse.json({ ok: true });
}
