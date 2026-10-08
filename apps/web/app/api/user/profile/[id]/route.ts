/**
 * /api/user/profile/[id] -- single-profile mutations and deletes.
 *
 *   PATCH  /api/user/profile/[id]    update profile fields
 *   DELETE /api/user/profile/[id]    remove profile (refuses to delete default)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase/route-handler';

const VALID_PROFILES = new Set(['healthy', 'child', 'elderly', 'asthmatic']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    profile_type?: string;
    conditions?: string[];
    personal_threshold?: number;
    is_default?: boolean;
  };
  const updates: Record<string, any> = {};
  if (body.name !== undefined) {
    if (body.name.length < 1 || body.name.length > 40) {
      return NextResponse.json({ error: 'name must be 1-40 characters' }, { status: 400 });
    }
    updates.name = body.name;
  }
  if (body.profile_type !== undefined) {
    if (!VALID_PROFILES.has(body.profile_type)) {
      return NextResponse.json({ error: `profile_type must be one of ${[...VALID_PROFILES].join(', ')}` }, { status: 400 });
    }
    updates.profile_type = body.profile_type;
  }
  if (body.conditions !== undefined) updates.conditions = body.conditions;
  if (body.personal_threshold !== undefined) updates.personal_threshold = body.personal_threshold;
  if (body.is_default !== undefined) updates.is_default = body.is_default;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no recognized fields' }, { status: 400 });
  }

  // RLS ensures user can only update their own profiles
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Refuse to delete the default profile
  const { data: prof } = await supabase
    .from('user_profiles')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!prof) return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  if (prof.is_default) {
    return NextResponse.json({ error: 'cannot delete the default profile. Make another profile default first.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}