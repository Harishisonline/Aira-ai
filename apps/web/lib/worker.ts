/**
 * Worker HTTP client. Every Next.js page or API route that needs live
 * AQI / forecast / station data goes through here.
 *
 * Falls back to a deterministic mock if WORKER_URL is unreachable (e.g.
 * during local dev before docker-compose is up) so pages still render.
 */

import type { AqiReading, StationSummary } from './types';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000';

export async function fetchAqi(place: string): Promise<AqiReading | null> {
  try {
    const r = await fetch(`${WORKER_URL}/aqi/now?place=${encodeURIComponent(place)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function fetchForecast(place: string) {
  try {
    const r = await fetch(`${WORKER_URL}/aqi/forecast?place=${encodeURIComponent(place)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function fetchStations(state: string): Promise<StationSummary[]> {
  try {
    const r = await fetch(`${WORKER_URL}/aqi/stations?state=${encodeURIComponent(state)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.stations ?? [];
  } catch {
    return [];
  }
}
