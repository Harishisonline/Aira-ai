/**
 * TypeScript mirror of apps/worker/app/compute/naqi.py
 * Source of truth is the Python file; this file is auto-generated from it
 * via tests/test_aqi_consistency.py.
 *
 * Implements the same NAQI formula. Same input -> same output.
 * Used in the Next.js API route for the city and forecast pages where we
 * want to display the AQI in the response without a network hop to the
 * worker for already-computed values.
 */

export type PollutantKey = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';

export interface AqiBucket {
  loAqi: number;
  hiAqi: number;
  label: BucketLabel;
}

export type BucketLabel = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';

export const BUCKETS: AqiBucket[] = [
  { loAqi: 0,   hiAqi: 50,  label: 'Good' },
  { loAqi: 51,  hiAqi: 100, label: 'Satisfactory' },
  { loAqi: 101, hiAqi: 200, label: 'Moderate' },
  { loAqi: 201, hiAqi: 300, label: 'Poor' },
  { loAqi: 301, hiAqi: 400, label: 'Very Poor' },
  { loAqi: 401, hiAqi: 500, label: 'Severe' },
];

export function bucketFromAqi(aqi: number): AqiBucket {
  if (!Number.isFinite(aqi)) throw new Error('aqi must be finite');
  for (const b of BUCKETS) {
    if (b.loAqi <= aqi && aqi <= b.hiAqi) return b;
  }
  if (aqi < 0) return BUCKETS[0];
  return BUCKETS[BUCKETS.length - 1];
}

interface Breakpoint { cLo: number; cHi: number; aLo: number; aHi: number; }

const PM25_BP: Breakpoint[] = [
  [0,   30,  0,   50],
  [31,  60,  51,  100],
  [61,  90,  101, 200],
  [91,  120, 201, 300],
  [121, 250, 301, 400],
  [251, 380, 401, 500],
] as unknown as Breakpoint[];
const PM10_BP: Breakpoint[] = [
  [0,   50,  0,   50],
  [51,  100, 51,  100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 600, 401, 500],
] as unknown as Breakpoint[];
const NO2_BP: Breakpoint[] = [
  [0,   40,  0,   50],
  [41,  80,  51,  100],
  [81,  180, 101, 200],
  [181, 280, 201, 300],
  [281, 400, 301, 400],
  [401, 550, 401, 500],
] as unknown as Breakpoint[];
const SO2_BP: Breakpoint[] = [
  [0,   40,  0,   50],
  [41,  80,  51,  100],
  [81,  380, 101, 200],
  [381, 800, 201, 300],
  [801, 1600, 301, 400],
  [1601, 2100, 401, 500],
] as unknown as Breakpoint[];
const CO_BP: Breakpoint[] = [
  [0.0, 1.0,   0,   50],
  [1.1, 2.0,   51,  100],
  [2.1, 10,    101, 200],
  [10.1, 17,   201, 300],
  [17.1, 34,  301, 400],
  [34.1, 50,  401, 500],
] as unknown as Breakpoint[];
const O3_BP: Breakpoint[] = [
  [0,   50,  0,   50],
  [51,  100, 51,  100],
  [101, 168, 101, 200],
  [169, 208, 201, 300],
  [209, 748, 301, 400],
  [749, 1000, 401, 500],
] as unknown as Breakpoint[];

const POLLUTANT_BP: Record<PollutantKey, Breakpoint[]> = {
  pm25: PM25_BP, pm10: PM10_BP, no2: NO2_BP, so2: SO2_BP, co: CO_BP, o3: O3_BP,
};

function subIndex(conc: number | null | undefined, bp: Breakpoint[]): number {
  if (conc == null || !Number.isFinite(conc) || conc < 0) return 0;
  const first = bp[0];
  if (conc < first.cLo) return first.aLo;
  const last = bp[bp.length - 1];
  if (conc > last.cHi) return last.aHi;
  for (const seg of bp) {
    if (seg.cLo <= conc && conc <= seg.cHi) {
      if (seg.cHi === seg.cLo) return seg.aHi;
      const slope = (seg.aHi - seg.aLo) / (seg.cHi - seg.cLo);
      return seg.aLo + slope * (conc - seg.cLo);
    }
  }
  return 0;
}

export interface NaqiResult {
  aqi: number;
  bucket: AqiBucket;
  dominantPollutant: PollutantKey;
  subIndices: Record<PollutantKey, number>;
}

export function computeAqi(readings: Partial<Record<PollutantKey, number | null>>): NaqiResult {
  const keys: PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
  const subs: Record<PollutantKey, number> = { pm25: 0, pm10: 0, no2: 0, so2: 0, co: 0, o3: 0 };
  const measured: Partial<Record<PollutantKey, number>> = {};
  for (const k of keys) {
    const c = readings[k];
    if (c != null && Number.isFinite(c) && c >= 0) {
      const v = subIndex(c, POLLUTANT_BP[k]);
      subs[k] = v;
      measured[k] = v;
    }
  }
  const measuredKeys = Object.keys(measured) as PollutantKey[];
  if (measuredKeys.length === 0) {
    throw new Error('at least one pollutant reading is required');
  }
  let aqi = 0;
  for (const k of measuredKeys) aqi = Math.max(aqi, measured[k]!);
  const dominant = measuredKeys.find(k => measured[k] === aqi)!;
  return {
    aqi,
    bucket: bucketFromAqi(aqi),
    dominantPollutant: dominant,
    subIndices: subs,
  };
}
