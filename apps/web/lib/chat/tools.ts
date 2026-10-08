/**
 * Chat tool implementations. Each tool returns live data — NEVER cached.
 *
 * Strategy: try the Python worker first (it has the most accurate data
 * pipeline + the scheduler that triggers fresh fetches). If the worker
 * is unreachable (e.g. from Vercel serverless where outbound to
 * db.<ref>.supabase.co:5432 is blocked), fall back to direct Supabase
 * REST queries. Both paths return the same shape so the chat caller
 * doesn't need to know.
 */

import type { AqiReading, Bucket, ForecastResult, StationSummary } from '../types';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type PollutantKey = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';
export type BucketLabel = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
export type Profile = 'healthy' | 'child' | 'elderly' | 'asthmatic';

// ----- helpers -----

async function workerGet<T>(path: string): Promise<T> {
  const r = await fetch(`${WORKER_URL}${path}`, {
    headers: { 'x-service': 'web' },
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });
  if (!r.ok) {
    throw new Error(`worker ${path} -> ${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

async function restGet<T>(path: string): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

/**
 * Try worker first (best when deployed with the Python worker), fall back
 * to Supabase REST (always works from Vercel).
 */
async function live<T>(workerPath: string, fallback: () => Promise<T | null>): Promise<T> {
  try {
    return await workerGet<T>(workerPath);
  } catch {
    const fb = await fallback();
    if (fb !== null) return fb;
    throw new Error(`worker unreachable and no fallback available for ${workerPath}`);
  }
}

const PLACE_STATION: Record<string, string> = {
  borivali: 'MUMBAI_BORIVALI',
  bandra: 'MUMBAI_BANDRA',
  andheri: 'MUMBAI_ANDHERI',
  colaba: 'MUMBAI_COLABA',
  navimumbai: 'MUMBAI_NAVI',
  thane: 'MUMBAI_THANE',
  kothrud: 'PUNE_KOTHRUD',
  swargate: 'PUNE_SWARGATE',
  civillines: 'NAGPUR_CIVIL',
  ramdaspeth: 'NAGPUR_RAM',
  gangapur: 'NASHIK_GANGAPUR',
  cidco: 'AURANGABAD_CIDCO',
  bhavanipeth: 'SOLAPUR_BHAVANI',
  rankala: 'KOLHAPUR_RANKALA',
  vishrambaug: 'SANGLI_VISHRAM',
};
const stationIdCache: Record<string, string> = {};

// Convert place slug (e.g. "borivali") to station_id (e.g. "MUMBAI_BORIVALI")
async function placeSlugToStationId(slug: string): Promise<string | null> {
  const key = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (PLACE_STATION[key]) return PLACE_STATION[key];
  if (stationIdCache[key]) return stationIdCache[key];
  const rows = await restGet<{ id: string }[]>(`/stations?select=id&limit=200`);
  if (!rows) return null;
  // Match by suffix: slug 'borivali' -> 'MUMBAI_BORIVALI'
  const target = key;
  for (const r of rows) {
    if (r.id.toLowerCase().endsWith(`_${target.toUpperCase()}`)) {
      stationIdCache[key] = r.id;
      return r.id;
    }
  }
  // Try exact match on place column
  const byPlace = await restGet<{ id: string }[]>(
    `/stations?select=id&place=ilike.${encodeURIComponent(slug)}&limit=1`
  );
  if (byPlace && byPlace[0]) {
    stationIdCache[key] = byPlace[0].id;
    return byPlace[0].id;
  }
  return null;
}

// ------------------------------------------------------------------
// Tool 1: get_current_aqi
// ------------------------------------------------------------------

export interface GetCurrentAqiResult {
  aqi: number;
  bucket: BucketLabel;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  dominant: PollutantKey;
  recorded_at: string;
}

export async function getCurrentAqi(placeSlug: string): Promise<GetCurrentAqiResult> {
  return live<GetCurrentAqiResult>(
    `/aqi/now?place=${encodeURIComponent(placeSlug)}`,
    async () => {
      const stationId = await placeSlugToStationId(placeSlug);
      if (!stationId) throw new Error(`unknown place: ${placeSlug}`);
      const rows = await restGet<any[]>(
        `/readings?station_id=eq.${stationId}&order=recorded_at.desc&limit=1`
      );
      if (!rows || !rows[0]) throw new Error(`no readings for ${placeSlug}`);
      const r = rows[0];
      return {
        aqi: r.aqi, bucket: r.bucket,
        pm25: Number(r.pm25), pm10: Number(r.pm10), no2: Number(r.no2),
        so2: Number(r.so2), co: Number(r.co), o3: Number(r.o3),
        dominant: r.dominant, recorded_at: r.recorded_at,
      };
    },
  );
}

// ------------------------------------------------------------------
// Tool 2: get_7day_forecast
// ------------------------------------------------------------------

export interface GetForecastResult {
  points: { date: string; predicted_aqi: number; confidence_low: number; confidence_high: number }[];
  r_squared: number;
  model_version: string;
}

export async function get7DayForecast(placeSlug: string): Promise<GetForecastResult> {
  return live<GetForecastResult>(
    `/aqi/forecast?place=${encodeURIComponent(placeSlug)}`,
    async () => {
      const stationId = await placeSlugToStationId(placeSlug);
      if (!stationId) throw new Error(`unknown place: ${placeSlug}`);
      const rows = await restGet<any[]>(
        `/forecasts?station_id=eq.${stationId}&order=forecast_date.asc&limit=7`
      );
      if (!rows) throw new Error(`no forecasts for ${placeSlug}`);
      return {
        points: rows.map(r => ({
          date: r.forecast_date,
          predicted_aqi: r.predicted_aqi,
          confidence_low: r.ci_low,
          confidence_high: r.ci_high,
        })),
        r_squared: Number(rows[0].r_squared),
        model_version: rows[0].model_version,
      };
    },
  );
}

// ------------------------------------------------------------------
// Tool 3: get_recent_advisories_for_user
// ------------------------------------------------------------------

export interface GetRecentAdvisoriesResult {
  advisories: {
    station_id: string;
    profile: Profile;
    body: string;
    generated_at: string;
  }[];
}

export async function getRecentAdvisoriesForUser(
  userId: string, limit: number
): Promise<GetRecentAdvisoriesResult> {
  return live<GetRecentAdvisoriesResult>(
    `/advisories/recent?user_id=${encodeURIComponent(userId)}&limit=${limit}`,
    async () => {
      // Get the user's recent advisory views
      const views = await restGet<{ advisory_id: number; viewed_at: string }[]>(
        `/advisory_views?user_id=eq.${userId}&order=viewed_at.desc&limit=${limit}`
      );
      if (!views || !views.length) return { advisories: [] };
      const advIds = views.map(v => v.advisory_id).join(',');
      const advisories = await restGet<any[]>(
        `/advisories?id=in.(${advIds})&select=id,station_id,profile_type,body_md,generated_at`
      );
      if (!advisories) return { advisories: [] };
      return {
        advisories: advisories.map(a => ({
          station_id: a.station_id,
          profile: a.profile_type,
          body: a.body_md,
          generated_at: a.generated_at,
        })),
      };
    },
  );
}

// ------------------------------------------------------------------
// Tool 4: get_station_list_in_state
// ------------------------------------------------------------------

export interface GetStationListResult {
  stations: { id: string; name: string; city: string; place: string; state: string; aqi: number; dominant: PollutantKey }[];
}

let catalogCache: { at: number; stations: GetStationListResult['stations'] } | null = null;

/** Maharashtra stations with the latest AQI. Reused for a minute so chat stays fast. */
export async function getMaharashtraCatalog(): Promise<GetStationListResult['stations']> {
  if (catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.stations;
  try {
    const fresh = await getStationListInState('Maharashtra');
    if (fresh.stations.length) catalogCache = { at: Date.now(), stations: fresh.stations };
    return fresh.stations.length ? fresh.stations : (catalogCache?.stations ?? []);
  } catch {
    return catalogCache?.stations ?? [];
  }
}

export function bucketFromAqi(aqi: number): BucketLabel {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

export async function getStationListInState(state: string): Promise<GetStationListResult> {
  return live<GetStationListResult>(
    `/aqi/stations?state=${encodeURIComponent(state)}`,
    async () => {
      const stations = await restGet<any[]>(
        `/stations?state=ilike.${encodeURIComponent(state)}&is_active=eq.true&select=id,name,city,place,state&limit=200`
      );
      if (!stations) return { stations: [] };
      const ids = stations.map(s => s.id).join(',');
      const readings = await restGet<any[]>(
        `/readings?station_id=in.(${ids})&order=recorded_at.desc&limit=${stations.length * 2}&select=station_id,aqi,dominant`
      );
      const latestByStation = new Map<string, { aqi: number; dominant: PollutantKey }>();
      for (const r of readings ?? []) {
        if (!latestByStation.has(r.station_id)) {
          latestByStation.set(r.station_id, { aqi: r.aqi, dominant: r.dominant });
        }
      }
      return {
        stations: stations.map(s => ({
          id: s.id, name: s.name, city: s.city, place: s.place, state: s.state,
          aqi: latestByStation.get(s.id)?.aqi ?? 0,
          dominant: latestByStation.get(s.id)?.dominant ?? 'pm25',
        })),
      };
    },
  );
}

// ------------------------------------------------------------------
// Tool 5: get_methodology_text (static)
// ------------------------------------------------------------------

export function getMethodologyText(topic: 'naqi' | 'forecast' | 'chat' | 'sources'): string {
  const texts: Record<string, string> = {
    naqi: `Aira uses the National AQI (NAQI) formula published by India's Central Pollution Control Board. The AQI is the maximum of 6 sub-indices (PM2.5, PM10, NO2, SO2, CO, O3). Each sub-index uses piecewise-linear interpolation across 6 buckets: Good (0-50), Satisfactory (51-100), Moderate (101-200), Poor (201-300), Very Poor (301-400), Severe (401-500). The dominant pollutant is whichever one gave the max sub-index.`,
    forecast: `Forecasts use linear regression (OLS) on the last 30 days of daily AQI, run by the Python worker at /apps/worker/app/compute/forecast.py. The output is 7 daily AQI values plus a 1-SE confidence band. R-squared is reported as a confidence indicator (0 = no signal, 1 = perfect fit).`,
    chat: `This chat is powered by Groq (model: qwen/qwen3-32b primary, openai/gpt-oss-120b fallback). The system prompt is loaded from /apps/web/lib/chat/system-prompt.ts and constrains answers to AQI, forecast, advisories, and email scheduling. The LLM uses function-calling to fetch live data via these tools (never cached) before answering.`,
    sources: `Live AQI comes from the OpenAQ global aggregator (which mirrors Indian government stations including CPCB CCR) or a deterministic mock fetcher (apps/worker/app/fetchers/cpcb.py). Forecasts use the worker's in-house regression model. Email alerts use Resend.`,
  };
  return texts[topic] ?? '';
}

// ------------------------------------------------------------------
// Tool 6: schedule_email
// ------------------------------------------------------------------

export interface ScheduleEmailResult {
  ok: boolean;
  scheduled_for: string;
  remaining_today: number;
}

export interface CompareInput {
  placeA: string;
  placeB: string;
  profile?: Profile;
}

/**
 * Schedule an email. Calls the worker's /email/schedule endpoint. Falls back
 * to inserting directly into email_log via REST if the worker is unreachable.
 */
export async function scheduleEmail(args: {
  userId: string;
  whenIso: string;
  topic: string;
  placeSlug: string;
}): Promise<ScheduleEmailResult> {
  // Try worker first
  try {
    const r = await fetch(`${WORKER_URL}/email/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service': 'web' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) return r.json();
  } catch { /* fall through */ }

  // Fallback: direct REST insert
  const today = new Date().toISOString().slice(0, 10);
  const quota = await restGet<{ count: number }[]>(
    `/email_quota?user_id=eq.${args.userId}&quota_date=eq.${today}&select=count`
  );
  const count = quota?.[0]?.count ?? 0;
  if (count >= 2) {
    return { ok: false, scheduled_for: '', remaining_today: 0 };
  }

  // Get user email for recipient
  const users = await restGet<{ email: string; default_state: string; default_city: string; default_place: string }[]>(
    `/users?id=eq.${args.userId}&select=email,default_state,default_city,default_place`
  );
  if (!users?.[0]) return { ok: false, scheduled_for: '', remaining_today: 0 };

  // Insert into email_log
  const insertBody = {
    user_id: args.userId,
    kind: 'scheduled',
    recipient: users[0].email,
    subject: `[Aira] ${args.topic} · ${args.placeSlug}`,
    body_md: `You asked to be reminded about ${args.topic} in ${args.placeSlug}.`,
    status: 'queued',
    scheduled_for: args.whenIso,
    related_state: users[0].default_state,
    related_city: users[0].default_city,
    related_place: users[0].default_place,
  };
  const insertR = await fetch(`${SUPABASE_URL}/rest/v1/email_log`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(insertBody),
  });
  if (!insertR.ok) return { ok: false, scheduled_for: '', remaining_today: 0 };

  return { ok: true, scheduled_for: args.whenIso, remaining_today: 2 - count - 1 };
}