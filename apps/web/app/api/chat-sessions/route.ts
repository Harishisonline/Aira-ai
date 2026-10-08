/**
 * GET  /api/chat-sessions — list the current user's chat sessions
 * POST /api/chat-sessions — create a new chat session
 *
 * Auth: required. RLS enforces users only see their own sessions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase/route-handler';

export async function GET(_req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, state, city, place, profile_type, created_at, last_message_at')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: u } = await supabase
    .from('users')
    .select('default_state, default_city, default_place, health_profile')
    .eq('id', user.id)
    .single();
  if (!u) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    profile?: string;
    state?: string;
    city?: string;
    place?: string;
  };
  const allowed = new Set(['healthy', 'child', 'elderly', 'asthmatic']);
  const profile = body.profile && allowed.has(body.profile) ? body.profile : u.health_profile;
  const state = (body.state || u.default_state || '').trim();
  const city = (body.city || u.default_city || '').trim();
  const place = (body.place || u.default_place || '').trim();
  if (!state || !city || !place) {
    return NextResponse.json({ error: 'location is required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('chat_sessions').insert({
    user_id: user.id,
    state,
    city,
    place,
    profile_type: profile,
    title: `Chat · ${place} · ${profile}`,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}