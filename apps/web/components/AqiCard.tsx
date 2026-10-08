/**
 * AqiCard — the big AQI display used on the home page. Color-coded
 * bucket, dominant pollutant, 6 pollutants on the right.
 */

import type { AqiReading } from '../lib/types';
import styles from './AqiCard.module.css';

const BUCKET_COLORS: Record<string, string> = {
  Good: 'var(--good)',
  Satisfactory: 'var(--sat)',
  Moderate: 'var(--mod)',
  Poor: 'var(--poor)',
  VeryPoor: 'var(--vpoor)',
  Very_Poor: 'var(--vpoor)',
  Severe: 'var(--severe)',
};

const POLLUTANT_COLORS: Record<string, string> = {
  good: 'var(--good)',
  sat: 'var(--sat)',
  mod: 'var(--mod)',
  poor: 'var(--poor)',
  vpoor: 'var(--vpoor)',
  severe: 'var(--severe)',
};

function bucketClass(bucket: string) {
  return bucket.replace(/[ _]/g, '');  // 'Very Poor' -> 'VeryPoor'
}

function pollutantValueColor(value: number, threshold: number): string {
  // Returns the CSS variable for the pollutant's bucket
  if (value < threshold * 0.4) return POLLUTANT_COLORS.good;
  if (value < threshold * 0.6) return POLLUTANT_COLORS.sat;
  if (value < threshold) return POLLUTANT_COLORS.mod;
  return POLLUTANT_COLORS.poor;
}

const POLLUTANT_THRESHOLDS: Record<string, number> = {
  pm25: 60,
  pm10: 100,
  no2: 80,
  so2: 80,
  co: 4,    // mg/m³
  o3: 100,
};

const HOME_POLLUTANTS = ['pm25', 'pm10', 'no2', 'o3'] as const;
const ALL_POLLUTANTS = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'] as const;

const POLL_LABEL: Record<string, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO2',
  so2: 'SO2',
  co: 'CO',
  o3: 'O3',
};

/** Home mockup shows 4 rows; city dashboard can pass variant="all". */
export function AqiCard({ aqi, variant = 'home' }: { aqi: AqiReading; variant?: 'home' | 'all' }) {
  const color = BUCKET_COLORS[bucketClass(aqi.bucket)] ?? 'var(--mod)';
  const keys = variant === 'all' ? ALL_POLLUTANTS : HOME_POLLUTANTS;
  return (
    <div className={styles.card}>
      <div className={styles.left}>
        <div className={styles.station}>{aqi.place} Station</div>
        <div className={styles.value} style={{ color }}>{aqi.aqi}</div>
        <div className={styles.bucket} style={{ color }}>
          {aqi.bucket.toUpperCase()}
          {aqi.dominant && <span className={styles.dominant}> · dominated by {aqi.dominant.toUpperCase()}</span>}
        </div>
        <div className={styles.meta}>
          Last updated {new Date(aqi.recorded_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
        </div>
      </div>
      <div className={styles.right}>
        {keys.map((key) => {
          const value = aqi[key];
          const unit = key === 'co' ? 'mg/m³' : 'µg/m³';
          return (
            <div key={key} className={styles.pollRow}>
              <span className={styles.pollName}>{POLL_LABEL[key]}</span>
              <span className={styles.pollVal} style={{ color: pollutantValueColor(value, POLLUTANT_THRESHOLDS[key]) }}>
                {value.toFixed(key === 'co' ? 1 : 0)} {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
