/**
 * PATCH /api/users/me — partial update of the current user's profile.
 * Body: any of { display_name, bio, theme, default_state, default_city,
 *   default_place, alert_threshold, email_alerts_enabled, health_profile }
 * Auth: required. Returns { ok, updated: string[] }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase/route-handler';

const MAX_DISPLAY_NAME = 40;
const MAX_BIO = 200;
const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 500;
const VALID_THEMES = new Set(['light', 'dark']);
const VALID_PROFILES = new Set(['healthy', 'child', 'elderly', 'asthmatic']);

export async function PATCH(req: NextRequest) {
  const { supabase } = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, any>;
  const updates: Record<string, any> = {};

  if ('display_name' in body) {
    const v = String(body.display_name ?? '').trim();
    if (v.length < 1 || v.length > MAX_DISPLAY_NAME) {
      return NextResponse.json({ error: `display_name must be 1-${MAX_DISPLAY_NAME} characters` }, { status: 400 });
    }
    updates.display_name = v;
  }

  if ('bio' in body) {
    const v = String(body.bio ?? '').trim();
    if (v.length > MAX_BIO) {
      return NextResponse.json({ error: `bio must be ≤ ${MAX_BIO} characters` }, { status: 400 });
    }
    updates.bio = v || null;
  }

  if ('theme' in body) {
    if (!VALID_THEMES.has(body.theme)) {
      return NextResponse.json({ error: `theme must be 'light' or 'dark' (got '${body.theme}')` }, { status: 400 });
    }
    updates.theme = body.theme;
  }

  if ('default_state' in body || 'default_city' in body || 'default_place' in body) {
    if (!('default_state' in body && 'default_city' in body && 'default_place' in body)) {
      return NextResponse.json({ error: 'default_state, default_city, default_place must all be sent together' }, { status: 400 });
    }
    Object.assign(updates, {
      default_state: body.default_state,
      default_city: body.default_city,
      default_place: body.default_place,
    });
  }

  if ('alert_threshold' in body) {
    const t = Number(body.alert_threshold);
    if (!Number.isInteger(t) || t < MIN_THRESHOLD || t > MAX_THRESHOLD) {
      return NextResponse.json({ error: `alert_threshold must be an integer in [${MIN_THRESHOLD}, ${MAX_THRESHOLD}]` }, { status: 400 });
    }
    updates.alert_threshold = t;
  }

  if ('email_alerts_enabled' in body) {
    if (typeof body.email_alerts_enabled !== 'boolean') {
      return NextResponse.json({ error: 'email_alerts_enabled must be a boolean' }, { status: 400 });
    }
    updates.email_alerts_enabled = body.email_alerts_enabled;
  }

  if ('health_profile' in body) {
    if (!VALID_PROFILES.has(body.health_profile)) {
      return NextResponse.json({ error: `health_profile must be one of ${[...VALID_PROFILES].join(', ')}` }, { status: 400 });
    }
    updates.health_profile = body.health_profile;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no recognized fields' }, { status: 400 });
  }

  const { error } = await supabase.from('users').update(updates).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}