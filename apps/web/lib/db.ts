/**
 * Supabase data layer for the Next.js web app.
 *
 * Pages and API routes use this to query the database via the REST gateway
 * (PostgREST at /rest/v1). We use direct REST (not the JS client's chained
 * query builder) because it's simpler and works in serverless contexts.
 *
 * Why not use the Python worker from Vercel? Serverless functions can't reach
 * Supabase's direct Postgres connection (network-blocked), and the worker
 * itself can't run as a Vercel function. The Python worker is only for
 * long-running jobs (email scheduler, threshold scans, ingest); pages read
 * straight from PostgREST.
 */

import type {
  AqiReading, Bucket, StationSummary, ForecastResult,
  UserRow, StationRow, ReadingRow, ForecastRow,
} from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !ANON_KEY) {
  console.warn('[db] Supabase env vars missing');
}

// ----- low-level fetch helper -----

type FetchOpts = {
  /** When true, the request is sent with the user's session cookie (RLS-respecting). */
  authenticated?: boolean;
  /** Cookies from the incoming Next.js request (for SSR) */
  cookie?: string;
};

async function rest<T>(path: string, opts: FetchOpts = {}, init?: RequestInit): Promise<T | null> {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (opts.authenticated && opts.cookie) {
    headers['Cookie'] = opts.cookie;
    headers['Authorization'] = `Bearer ${ANON_KEY}`;
  } else {
    headers['Authorization'] = `Bearer ${ANON_KEY}`;
  }
  if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const r = await fetch(url, { ...init, headers, cache: 'no-store' });
  if (!r.ok) {
    if (r.status === 404) return null;
    console.error(`[db] ${init?.method ?? 'GET'} ${path} -> HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return null;
  }
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : null;
}

// ----- Stations -----

export async function getStations(state = 'Maharashtra', opts?: FetchOpts): Promise<StationRow[]> {
  const rows = await rest<StationRow[]>(
    `/stations?state=eq.${encodeURIComponent(state)}&is_active=eq.true&select=id,name,state,city,place,lat,lng,operator,is_active&order=city,place&limit=200`,
    opts,
  );
  return rows ?? [];
}

export async function getStation(id: string, opts?: FetchOpts): Promise<StationRow | null> {
  const rows = await rest<StationRow[]>(
    `/stations?id=eq.${encodeURIComponent(id)}&select=id,name,state,city,place,lat,lng,operator,is_active&limit=1`,
    opts,
  );
  return rows?.[0] ?? null;
}

export async function getStationByPlace(state: string, city: string, place: string, opts?: FetchOpts): Promise<StationRow | null> {
  const rows = await rest<StationRow[]>(
    `/stations?state=eq.${encodeURIComponent(state)}&city=eq.${encodeURIComponent(city)}&place=eq.${encodeURIComponent(place)}&select=id,name,state,city,place,lat,lng,operator,is_active&limit=1`,
    opts,
  );
  return rows?.[0] ?? null;
}

// ----- Readings -----

export async function getLatestReading(stationId: string, opts?: FetchOpts): Promise<ReadingRow | null> {
  const rows = await rest<ReadingRow[]>(
    `/readings?station_id=eq.${encodeURIComponent(stationId)}&order=recorded_at.desc&limit=1&select=id,station_id,pm25,pm10,no2,so2,co,o3,aqi,bucket,dominant,source,recorded_at`,
    opts,
  );
  return rows?.[0] ?? null;
}

export async function getReadingsHistory(stationId: string, days: number, opts?: FetchOpts): Promise<ReadingRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await rest<ReadingRow[]>(
    `/readings?station_id=eq.${encodeURIComponent(stationId)}&recorded_at=gte.${since}&order=recorded_at.asc&select=id,station_id,pm25,pm10,no2,so2,co,o3,aqi,bucket,dominant,source,recorded_at`,
    opts,
  );
  return rows ?? [];
}

// ----- Forecasts -----

export async function getForecast(stationId: string, opts?: FetchOpts): Promise<ForecastRow[]> {
  const rows = await rest<ForecastRow[]>(
    `/forecasts?station_id=eq.${encodeURIComponent(stationId)}&order=forecast_date.asc&limit=7&select=id,station_id,forecast_date,predicted_aqi,ci_low,ci_high,r_squared,model_version,generated_at`,
    opts,
  );
  return rows ?? [];
}

// ----- Users -----

export async function getUserById(userId: string, opts: FetchOpts): Promise<UserRow | null> {
  const rows = await rest<UserRow[]>(`/users?id=eq.${encodeURIComponent(userId)}&limit=1`, opts);
  return rows?.[0] ?? null;
}

// ----- Composites -----

export async function getStationsWithAqi(state = 'Maharashtra', opts?: FetchOpts): Promise<StationSummary[]> {
  // Fetch stations + all latest readings in parallel
  const stations = await getStations(state, opts);
  if (stations.length === 0) return [];

  const stationIds = stations.map(s => s.id);
  const idList = `(${stationIds.map(encodeURIComponent).join(',')})`;

  // PostgREST: get the latest reading per station via a window function trick.
  // We get the latest 1 reading per station by ordering by recorded_at DESC
  // and filtering by station_id IN. To get *exactly* one per station, we
  // ask for N rows and group client-side.
  const readings = await rest<ReadingRow[]>(
    `/readings?station_id=in.${idList}&order=recorded_at.desc&limit=${stations.length * 2}&select=station_id,aqi,bucket,dominant,recorded_at`,
    opts,
  ) ?? [];

  // Group: take the first reading per station_id
  const latestByStation = new Map<string, ReadingRow>();
  for (const r of readings) {
    if (!latestByStation.has(r.station_id)) {
      latestByStation.set(r.station_id, r);
    }
  }

  return stations.map(s => {
    const reading = latestByStation.get(s.id);
    return {
      id: s.id,
      name: s.name,
      state: s.state,
      city: s.city,
      place: s.place,
      lat: s.lat ?? 0,
      lng: s.lng ?? 0,
      aqi: reading?.aqi ?? null,
      bucket: reading?.bucket ?? null,
      dominant: reading?.dominant ?? null,
    };
  });
}

export async function getAqiReading(stationId: string, opts?: FetchOpts): Promise<AqiReading | null> {
  const [s, r] = await Promise.all([
    getStation(stationId, opts),
    getLatestReading(stationId, opts),
  ]);
  if (!s) return null;
  if (!r) {
    // No reading exists; return a "stale" zero-AQI placeholder
    return {
      place: s.place,
      city: s.city,
      aqi: 0,
      bucket: 'Good',
      pm25: 0, pm10: 0, no2: 0, so2: 0, co: 0, o3: 0,
      dominant: 'pm25',
      recorded_at: new Date(0).toISOString(),
      stale: true,
    };
  }
  const recordedAt = new Date(r.recorded_at);
  const stale = (Date.now() - recordedAt.getTime()) > 2 * 60 * 60 * 1000; // 2h
  return {
    place: s.place,
    city: s.city,
    aqi: r.aqi,
    bucket: r.bucket as Bucket,
    pm25: r.pm25,
    pm10: r.pm10,
    no2: r.no2,
    so2: r.so2,
    co: r.co,
    o3: r.o3,
    dominant: r.dominant,
    recorded_at: r.recorded_at,
    stale,
  };
}

export async function getForecastResult(stationId: string, opts?: FetchOpts): Promise<ForecastResult | null> {
  const [s, forecasts] = await Promise.all([
    getStation(stationId, opts),
    getForecast(stationId, opts),
  ]);
  if (!s || forecasts.length === 0) return null;
  return {
    place: s.place,
    r_squared: forecasts[0].r_squared,
    model_version: forecasts[0].model_version,
    points: forecasts.map(f => ({
      date: f.forecast_date,
      predicted_aqi: f.predicted_aqi,
      confidence_low: f.ci_low,
      confidence_high: f.ci_high,
    })),
  };
}