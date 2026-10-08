/**
 * GET /api/stations  — list Maharashtra stations with current AQI.
 * Optional query params: ?state=maharashtra&city=mumbai&place=borivali
 *
 * Public endpoint (no auth). Used by the picker on the Select Area page
 * and by the Map sidebar. Always returns LIVE data (the worker just
 * computed the AQI in the last 15 minutes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest): Promise<Response> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { cache: 'no-store' } } }
  );
  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state') ?? 'maharashtra';
  const city = searchParams.get('city');
  const place = searchParams.get('place');

  // Supabase stores state names capitalized ("Maharashtra"); the route
  // accepts both casings from the URL.
  const stateNormalized = state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();

  // Stations
  let q = supabase.from('stations').select('id, name, state, city, place, lat, lng, operator, is_active').eq('state', stateNormalized).eq('is_active', true);
  if (city) q = q.eq('city', city);
  if (place) q = q.eq('place', place);
  const { data: stations, error: serr } = await q;
  if (serr) return NextResponse.json({ error: serr.message }, { status: 500 });
  if (!stations || stations.length === 0) {
    return NextResponse.json({ stations: [] });
  }

  // Latest reading per station
  const stationIds = stations.map(s => s.id);
  const { data: readings, error: rerr } = await supabase
    .from('readings')
    .select('station_id, aqi, bucket, dominant, recorded_at')
    .in('station_id', stationIds)
    .order('recorded_at', { ascending: false });
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  // Pick the latest reading per station
  const latest: Record<string, any> = {};
  for (const r of readings ?? []) {
    if (!latest[r.station_id]) latest[r.station_id] = r;
  }

  return NextResponse.json({
    stations: stations.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      city: s.city,
      place: s.place,
      lat: s.lat,
      lng: s.lng,
      operator: s.operator,
      aqi: latest[s.id]?.aqi ?? null,
      bucket: latest[s.id]?.bucket ?? null,
      dominant: latest[s.id]?.dominant ?? null,
      recorded_at: latest[s.id]?.recorded_at ?? null,
    })),
  });
}
