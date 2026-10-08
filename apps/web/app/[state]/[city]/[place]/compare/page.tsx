/**
 * Compare page — picks two areas, fetches live data for each via our
 * internal /api/compare endpoint (which calls Supabase + Groq), renders
 * the 4 sections: headline cards, forecast overlay chart, pollutant bar
 * comparison, health implications.
 *
 * The data is always LIVE — fetched at the moment the user hits the page.
 * The Groq report uses this live data.
 *
 * On mount, if both `?a=` and `?b=` are present in the URL, the page
 * auto-fetches the comparison report (per PRD §5.3).
 *
 * Client component (uses hooks for the dropdowns).
 */

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { ChangeLocationPill } from '../../../../../components/ChangeLocationPill';
import styles from './page.module.css';
import Link from 'next/link';

interface CompareReading {
  aqi: number;
  bucket: string;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  dominant: string;
}
interface CompareStation {
  id: string;
  name: string;
  city: string;
  place: string;
  state: string;
}
interface CompareForecast {
  r_squared: number;
  model_version: string;
  points: { date: string; predicted_aqi: number; confidence_low: number; confidence_high: number }[];
}
interface CompareResult {
  a: { station: CompareStation; reading: CompareReading; forecast: CompareForecast };
  b: { station: CompareStation; reading: CompareReading; forecast: CompareForecast };
  report: string;
  profile: string;
}

const PLACE_OPTIONS: Array<{ label: string; stationId: string }> = [
  { label: 'Borivali, Mumbai', stationId: 'MUMBAI_BORIVALI' },
  { label: 'Bandra, Mumbai', stationId: 'MUMBAI_BANDRA' },
  { label: 'Andheri, Mumbai', stationId: 'MUMBAI_ANDHERI' },
  { label: 'Colaba, Mumbai', stationId: 'MUMBAI_COLABA' },
  { label: 'Navi Mumbai, Mumbai', stationId: 'MUMBAI_NAVI' },
  { label: 'Thane, Mumbai', stationId: 'MUMBAI_THANE' },
  { label: 'Kothrud, Pune', stationId: 'PUNE_KOTHRUD' },
  { label: 'Swargate, Pune', stationId: 'PUNE_SWARGATE' },
  { label: 'Civil Lines, Nagpur', stationId: 'NAGPUR_CIVIL' },
  { label: 'Ramdaspeth, Nagpur', stationId: 'NAGPUR_RAM' },
  { label: 'Gangapur, Nashik', stationId: 'NASHIK_GANGAPUR' },
  { label: 'CIDCO, Aurangabad', stationId: 'AURANGABAD_CIDCO' },
];

const PROFILES = ['healthy', 'child', 'elderly', 'asthmatic'] as const;

const PROFILE_LINES: Record<string, string> = {
  healthy: 'Air quality is acceptable for most people.',
  child: "Children's lungs are still developing. Limit outdoor play on Moderate or worse days.",
  elderly: 'Heart and lung conditions worsen faster at Poor+. Walk slowly, rest often.',
  asthmatic: 'Outdoor air will likely trigger symptoms at Poor+. Keep rescue inhaler accessible.',
};

function bucketVar(bucket: string): string {
  return ({
    Good: 'good',
    Satisfactory: 'sat',
    Moderate: 'mod',
    Poor: 'poor',
    'Very Poor': 'vpoor',
    Severe: 'severe',
  } as Record<string, string>)[bucket] ?? 'mod';
}

export default function ComparePage() {
  const params = useSearchParams();
  const routeParams = useParams<{ state: string; city: string; place: string }>();
  const baseHref = routeParams
    ? `/${routeParams.state}/${routeParams.city}/${routeParams.place}`
    : '/maharashtra/mumbai/borivali';
  // Default: current place (Borivali) vs contrasting city (Pune Kothrud) — P4
  const [placeAId, setPlaceAId] = useState(params.get('a') ?? 'MUMBAI_BORIVALI');
  const [placeBId, setPlaceBId] = useState(params.get('b') ?? 'PUNE_KOTHRUD');
  const [profile, setProfile] = useState<typeof PROFILES[number]>(
    (params.get('profile') as typeof PROFILES[number]) || 'healthy',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareResult | null>(null);

  function syncUrl(a: string, b: string, p: string) {
    const qs = new URLSearchParams({ a, b, profile: p });
    window.history.replaceState(null, '', `?${qs.toString()}`);
  }

  async function runCompare() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeA: placeAId, placeB: placeBId, profile }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(json.error ?? json.message ?? `HTTP ${r.status}`);
      }
      if (!json.a?.reading || !json.b?.reading) {
        setData(null);
        setError(json.report ?? 'Comparison unavailable — the comparison service is offline');
        return;
      }
      setData(json as CompareResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  // Sync URL whenever the three controls change.
  useEffect(() => {
    syncUrl(placeAId, placeBId, profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeAId, placeBId, profile]);

  // B3.6: On mount, if both `?a=` and `?b=` are present in the URL,
  // auto-fetch the comparison report (per PRD §5.3). The first useEffect
  // above also re-fires runCompare via the [placeAId, placeBId, profile]
  // deps, but we kick one off explicitly on mount to satisfy the spec
  // (and to ensure we fire even if URL params happen to match defaults).
  useEffect(() => {
    const a = params.get('a');
    const b = params.get('b');
    if (a && b) {
      runCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = data
    ? `${data.a.station.name} vs ${data.b.station.name}`
    : 'Compare two areas';
  const aLower = data ? data.a.reading.aqi < data.b.reading.aqi : false;
  const bLower = data ? data.b.reading.aqi < data.a.reading.aqi : false;
  const tied = data ? data.a.reading.aqi === data.b.reading.aqi : false;

  return (
    <main className={styles.main}>
      <div className={styles.crumb}>
        <Link href={baseHref}>Home</Link>
        <span>/</span>
        <Link href={baseHref}>{routeParams?.city ?? 'Mumbai'}</Link>
        <span>/</span>
        <Link href={baseHref}>{routeParams?.place ?? 'Borivali'}</Link>
        <span>/</span>
        <span className={styles.current}>Compare</span>
      </div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.h1}>{title}</h1>
          <p className={styles.sub}>Side-by-side comparison of two Maharashtra stations. Both areas must be in the same state in v1.</p>
        </div>
        <ChangeLocationPill place="Maharashtra" />
      </div>

      <div className={styles.picker}>
        <div className={styles.pickCol}>
          <label>Area 1</label>
          <select value={placeAId} onChange={(e) => setPlaceAId(e.target.value)}>
            {PLACE_OPTIONS.map(p => <option key={p.stationId} value={p.stationId}>{p.label} · Maharashtra</option>)}
          </select>
        </div>
        <div className={styles.pickVs}>vs</div>
        <div className={styles.pickCol}>
          <label>Area 2</label>
          <select value={placeBId} onChange={(e) => setPlaceBId(e.target.value)}>
            {PLACE_OPTIONS.map(p => <option key={p.stationId} value={p.stationId}>{p.label} · Maharashtra</option>)}
          </select>
        </div>
        <div className={styles.pickCol}>
          <label>Profile</label>
          <select value={profile} onChange={(e) => setProfile(e.target.value as typeof PROFILES[number])}>
            {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button type="button" className={styles.pickBtn} onClick={runCompare} disabled={loading}>Compare</button>
      </div>

      {error && (
        <div className={styles.error}>
          <strong>Couldn't load comparison:</strong> {error}
          <br />
          <button onClick={runCompare} className={styles.retryBtn}>Retry</button>
        </div>
      )}

      {loading && (
        <div className={styles.loading}>
          <span className={styles.spinner} /> Fetching the latest readings for these areas…
        </div>
      )}

      {data && !loading && (
        <>
          <section className={styles.headline}>
            <SideCard
              station={data.a.station}
              reading={data.a.reading}
              verdict={aLower || tied ? 'best' : 'avoid'}
              profile={profile}
            />
            <div className={styles.vsDivider}>vs</div>
            <SideCard
              station={data.b.station}
              reading={data.b.reading}
              verdict={bLower || tied ? 'best' : 'avoid'}
              profile={profile}
            />
          </section>

          <ForecastOverlay a={data.a} b={data.b} />

          <PollutantBars a={data.a} b={data.b} />

          <section className={styles.sectionCard}>
            <div className={styles.sectionEyebrow}>Health implications</div>
            <h2 className={styles.sectionH2}>What this means for your {profileLabel(profile)}</h2>
            <div className={styles.implications}>
              <h3>For {profileLabel(profile)} · today</h3>
              <p>{data.report}</p>
              <p>{PROFILE_LINES[data.profile]}</p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function profileLabel(profile: string): string {
  return ({
    healthy: 'healthy adults',
    child: 'children',
    elderly: 'elderly',
    asthmatic: 'asthmatics',
  } as Record<string, string>)[profile] ?? profile;
}

function SideCard({ station, reading, verdict, profile }: {
  station: CompareStation;
  reading: CompareReading;
  verdict: 'best' | 'avoid';
  profile: string;
}) {
  const color = `var(--${bucketVar(reading.bucket)})`;
  return (
    <div className={styles.aqiCard}>
      <div className={styles.areaName}>{station.name}, {station.city}</div>
      <div className={styles.row}>
        <div className={styles.val} style={{ color }}>{reading.aqi}</div>
        <div className={styles.bucket} style={{ color }}>{reading.bucket}</div>
      </div>
      <div className={styles.meta}>Dominant: {reading.dominant}</div>
      {verdict === 'best' ? (
        <div className={styles.verdictBest}>✓ Best for {profileLabel(profile)} today</div>
      ) : (
        <div className={styles.verdictAvoid}>✕ Avoid for {profileLabel(profile)} today</div>
      )}
    </div>
  );
}

function ForecastOverlay({ a, b }: { a: CompareResult['a']; b: CompareResult['b'] }) {
  const W = 1280, H = 280, PAD = 32;
  const pointsA = a.forecast.points;
  const pointsB = b.forecast.points;
  const n = Math.max(pointsA.length, pointsB.length);
  if (n < 2) return null;
  const maxY = Math.max(
    ...pointsA.map(p => p.confidence_high),
    ...pointsB.map(p => p.confidence_high),
    250,
  ) + 20;
  const xStep = (W - 2 * PAD) / (n - 1);
  const yOf = (v: number) => H - PAD - (v / maxY) * (H - 2 * PAD);
  const pathA = pointsA.map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * xStep} ${yOf(p.predicted_aqi)}`).join(' ');
  const pathB = pointsB.map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * xStep} ${yOf(p.predicted_aqi)}`).join(' ');
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionEyebrow}>7-day forecast</div>
      <h2 className={styles.sectionH2}>Both areas, side by side</h2>
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'var(--accent)' }} /> {a.station.name}</span>
        <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'var(--poor)' }} /> {b.station.name}</span>
      </div>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg}>
          <path d={pathA} stroke="var(--accent)" strokeWidth="2.5" fill="none" />
          <path d={pathB} stroke="var(--poor)" strokeWidth="2.5" strokeDasharray="6 3" fill="none" />
        </svg>
      </div>
    </section>
  );
}

function PollutantBars({ a, b }: { a: CompareResult['a']; b: CompareResult['b'] }) {
  const pollutants: { key: PollKey; label: string }[] = [
    { key: 'pm25', label: 'PM2.5' },
    { key: 'pm10', label: 'PM10' },
    { key: 'no2', label: 'NO2' },
    { key: 'so2', label: 'SO2' },
    { key: 'co', label: 'CO' },
    { key: 'o3', label: 'O3' },
  ];

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionEyebrow}>Pollutant comparison</div>
      <h2 className={styles.sectionH2}>What&apos;s different right now</h2>
      {pollutants.map((p) => {
        const av = a.reading[p.key];
        const bv = b.reading[p.key];
        const max = Math.max(av, bv, 1);
        const digits = p.key === 'co' ? 2 : 0;
        return (
          <div key={p.key} className={styles.polRow}>
            <div className={styles.polName}>{p.label}</div>
            <div className={styles.polBar}>
              <div className={styles.polFill} style={{ width: `${(av / max) * 100}%`, background: 'linear-gradient(90deg, var(--accent), #008c7e)' }}>
                <span className={styles.polValue}>{av.toFixed(digits)}</span>
              </div>
            </div>
            <div className={styles.polBar}>
              <div className={styles.polFill} style={{ width: `${(bv / max) * 100}%`, background: 'linear-gradient(90deg, var(--poor), #e07600)' }}>
                <span className={styles.polValue}>{bv.toFixed(digits)}</span>
              </div>
            </div>
            <div className={styles.polNote}>{pollNote(p.label, av, bv, a.station.name, b.station.name)}</div>
          </div>
        );
      })}
    </section>
  );
}

type PollKey = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';

function pollNote(label: string, av: number, bv: number, nameA: string, nameB: string): string {
  const hi = Math.max(av, bv);
  const lo = Math.min(av, bv);
  if (lo === 0 && hi === 0) return `${label} is similar in both areas`;
  const pct = lo === 0 ? 100 : Math.round(((hi - lo) / lo) * 100);
  if (pct < 10) return `${label} is similar in both areas`;
  const higher = av >= bv ? nameA : nameB;
  return `${label} is ${pct}% higher in ${higher}`;
}
