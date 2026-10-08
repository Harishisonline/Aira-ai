/**
 * City dashboard — AQI, pollutant rows, advisory callout, and the Compare
 * panel. Reads from Supabase REST. Parameterised by /[state]/[city]/[place].
 */

import { notFound } from 'next/navigation';
import { ChangeLocationPill } from '../../../../../components/ChangeLocationPill';
import { ComparePanel } from '../../../../../components/ComparePanel';
import { getAqiReading, getStations, getStationByPlace } from '../../../../../lib/db';
import { unslug } from '../../../../../lib/area';
import type { AqiReading, Profile as ProfileType } from '../../../../../lib/types';
import styles from './page.module.css';
import Link from 'next/link';
import { getServerSupabase } from '../../../../../lib/supabase/route-handler';

export const dynamic = 'force-dynamic';

const PROFILE_LABEL: Record<ProfileType, string> = {
  healthy: 'Healthy adults',
  child: 'Children',
  elderly: 'Elderly',
  asthmatic: 'Asthmatics',
};

const BUCKET_COPY: Record<string, string> = {
  Good: 'Minimal impact',
  Satisfactory: 'Minor breathing discomfort for very sensitive people',
  Moderate: 'Acceptable, sensitive groups should consider reducing prolonged outdoor exertion',
  Poor: 'Breathing discomfort for most people on prolonged exposure',
  'Very Poor': 'Respiratory illness on prolonged exposure',
  Severe: 'Affects healthy people and those with existing disease',
};

const THRESHOLDS: Record<string, number> = {
  pm25: 60,
  pm10: 100,
  no2: 80,
  so2: 80,
  co: 4,
  o3: 100,
};

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string; place: string }>;
}) {
  const { state, city, place } = await params;
  const station = await getStationByPlace(unslug(state), unslug(city), unslug(place)).catch(() => null);
  if (!station) notFound();
  const base = `/${state}/${city}/${place}`;
  const placeLabel = `${station.place}, ${station.city}`;

  const [aqi, stations] = await Promise.all([
    getAqiReading(station.id),
    getStations('Maharashtra'),
  ]);

  let profile: ProfileType = 'healthy';
  let signedIn = false;
  try {
    const { supabase } = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('health_profile')
        .eq('id', user.id)
        .single();
      if (data?.health_profile) profile = data.health_profile as ProfileType;
    }
  } catch {
    /* anonymous visitors still see the public reading */
  }

  const placeOptions = stations.map((s) => ({
    label: `${s.place}, ${s.city}`,
    slug: s.id,
  }));

  if (!aqi) {
    return (
      <main className={styles.main}>
        <p>No reading available yet. The worker should publish one within 15 minutes.</p>
      </main>
    );
  }

  const color = bucketColor(aqi.bucket);

  return (
    <main className={styles.main}>
      <div className={styles.crumb}>
        <Link href={base}>Home</Link>
        <span>/</span>
        <Link href={base}>{station.city}</Link>
        <span>/</span>
        <span className={styles.current}>{station.place}</span>
      </div>

      <div className={styles.head}>
        <div>
          <h1 className={styles.h1}>{station.place}, {station.city}</h1>
          <p className={styles.headerSub}>
            Live AQI from the {station.place} monitoring station. Last updated {minutesAgo(aqi.recorded_at)}.
          </p>
        </div>
        <ChangeLocationPill place={placeLabel} />
      </div>

      <div className={styles.aqiCard}>
        <div className={styles.aqiLeft}>
          <div className={styles.station}>{station.place} Station</div>
          <div className={styles.aqiNum} style={{ color }}>{aqi.aqi}</div>
          <div className={styles.aqiBucket}>
            {aqi.bucket.toUpperCase()} — {BUCKET_COPY[aqi.bucket] ?? aqi.bucket}
          </div>
          {aqi.stale && <div className={styles.stale}>Data is stale (over 2 hours old)</div>}
          <Link href={`${base}/forecast`} className={styles.cta}>
            View 7-day forecast →
          </Link>
        </div>
        <div className={styles.aqiRight}>
          <Pollutants reading={aqi} />
        </div>
      </div>

      <section className={styles.advisory}>
        <div className={styles.advisoryIcon}>!</div>
        <div className={styles.advisoryBody}>
          <div className={styles.advisoryTitle}>Health advisory for {PROFILE_LABEL[profile]}</div>
          <div className={styles.advisoryText}>{advisoryFor(profile, aqi.aqi, aqi.bucket)}</div>
          {!signedIn && (
            <p className={styles.signinPrompt}>
              <Link href="/signin">Sign in</Link> to ask Aira a specific question about today&apos;s reading.
            </p>
          )}
        </div>
      </section>

      <ComparePanel
        placeOptions={placeOptions}
        currentPlace={station.id}
        currentPlaceLabel={placeLabel}
      />
    </main>
  );
}

function Pollutants({ reading }: { reading: AqiReading }) {
  const items: { key: keyof typeof THRESHOLDS; label: string; value: number; unit: string }[] = [
    { key: 'pm25', label: 'PM2.5', value: reading.pm25, unit: 'µg/m³' },
    { key: 'pm10', label: 'PM10', value: reading.pm10, unit: 'µg/m³' },
    { key: 'no2', label: 'NO2', value: reading.no2, unit: 'µg/m³' },
    { key: 'so2', label: 'SO2', value: reading.so2, unit: 'µg/m³' },
    { key: 'co', label: 'CO', value: reading.co, unit: 'mg/m³' },
    { key: 'o3', label: 'O3', value: reading.o3, unit: 'µg/m³' },
  ];
  return (
    <>
      {items.map((item) => (
        <div key={item.key} className={styles.pollRow}>
          <span className={styles.pollName}>
            {item.label}{item.key === reading.dominant ? ' · dominant' : ''}
          </span>
          <span className={`${styles.pollVal} ${pollClass(item.value, THRESHOLDS[item.key])}`}>
            {item.value.toFixed(item.key === 'co' ? 1 : 0)} {item.unit}
          </span>
        </div>
      ))}
    </>
  );
}

function pollClass(value: number, threshold: number): string {
  if (value < threshold * 0.4) return styles.good;
  if (value < threshold * 0.6) return styles.sat;
  if (value < threshold) return styles.mod;
  return styles.poor;
}

function bucketColor(bucket: string): string {
  const map: Record<string, string> = {
    Good: 'var(--good)',
    Satisfactory: 'var(--sat)',
    Moderate: 'var(--mod)',
    Poor: 'var(--poor)',
    'Very Poor': 'var(--vpoor)',
    Severe: 'var(--severe)',
  };
  return map[bucket] ?? 'var(--mod)';
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

function advisoryFor(profile: ProfileType, aqi: number, bucket: string): string {
  const tone: Record<ProfileType, string> = {
    healthy: 'Generally safe to be outdoors.',
    child: 'Limit prolonged outdoor play.',
    elderly: 'Reduce exertion and stay hydrated.',
    asthmatic: 'Carry your inhaler; avoid outdoor exertion.',
  };
  const activity: Record<string, string> = {
    Good: 'Open the windows, go for a run.',
    Satisfactory: 'Outdoor activities are fine for most people.',
    Moderate: 'Sensitive groups should consider lighter outdoor time.',
    Poor: 'Limit outdoor exertion; consider an N95 mask.',
    'Very Poor': 'Stay indoors as much as possible. Use an air purifier.',
    Severe: 'Do not go outside. Seal gaps around windows and doors.',
  };
  return `${tone[profile]} AQI is ${aqi} (${bucket}). ${activity[bucket] ?? ''}`.trim();
}
