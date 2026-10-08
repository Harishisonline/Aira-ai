/**
 * /api/user/profile -- CRUD on the user's health profiles (max 4).
 *
 *   GET    /api/user/profile        list all profiles for the user
 *   POST   /api/user/profile        create a new profile (body: name, profile_type, conditions, personal_threshold)
 *
 * Per-row mutations and deletes live at /api/user/profile/[id].
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase/route-handler';

const VALID_PROFILES = new Set(['healthy', 'child', 'elderly', 'asthmatic']);
const MAX_PROFILES_PER_USER = 4;

export async function GET(_req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, name, profile_type, conditions, personal_threshold, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    profile_type?: string;
    conditions?: string[];
    personal_threshold?: number;
  };
  if (!body.name || !body.profile_type) {
    return NextResponse.json({ error: 'name and profile_type are required' }, { status: 400 });
  }
  if (!VALID_PROFILES.has(body.profile_type)) {
    return NextResponse.json({ error: `profile_type must be one of ${[...VALID_PROFILES].join(', ')}` }, { status: 400 });
  }
  if (body.name.length > 40) {
    return NextResponse.json({ error: 'name must be ≤ 40 characters' }, { status: 400 });
  }

  // Max 4 profiles per user
  const { count } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (count !== null && count >= MAX_PROFILES_PER_USER) {
    return NextResponse.json({ error: `max ${MAX_PROFILES_PER_USER} profiles per user` }, { status: 400 });
  }

  const { data, error } = await supabase.from('user_profiles').insert({
    user_id: user.id,
    name: body.name,
    profile_type: body.profile_type,
    conditions: body.conditions ?? [],
    personal_threshold: body.personal_threshold ?? 200,
    is_default: (count ?? 0) === 0,  // first profile is the default
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}