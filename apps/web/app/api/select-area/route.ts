/**
 * POST /api/select-area — updates the user's default area.
 * Body: { state, city, place, from?: 'general' | 'onboarding' }
 * Returns { ok, redirect } — redirect is the page the client should
 * navigate to after the change.
 *
 * If from='general', the redirect is /settings/general (so the user
 * came from there and returns to the same page). Otherwise the redirect
 * is the home page for the new area.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase/route-handler';

export async function POST(req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as { state?: string; city?: string; place?: string; from?: string };
  if (!body.state || !body.city || !body.place) {
    return NextResponse.json({ error: 'state, city, place are all required' }, { status: 400 });
  }

  const { data: u, error } = await supabase.from('users').update({
    default_state: body.state,
    default_city: body.city,
    default_place: body.place,
  }).eq('id', user.id).select().single();
  if (error || !u) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 });
  await supabase.auth.updateUser({ data: { area_selected: true } });

  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  const redirect = body.from === 'general'
    ? '/settings/general'
    : `/${body.state}/${slug(body.city!)}/${slug(body.place!)}`;
  return NextResponse.json({ ok: true, redirect });
}