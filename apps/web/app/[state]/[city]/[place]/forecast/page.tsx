/**
 * Forecast page — 7-day AQI forecast with a line chart of last 30 days
 * (real history from Supabase) + 7-day forecast + confidence band.
 *
 * Reads from Supabase REST directly. The chart is SVG (no chart lib).
 *
 * Works for any /[state]/[city]/[place] (Borivali by default).
 */

import { notFound } from 'next/navigation';
import { ChangeLocationPill } from '../../../../../components/ChangeLocationPill';
import { PlainEnglish } from '../../../../../components/PlainEnglish';
import { getAqiReading, getForecastResult, getReadingsHistory, getStationByPlace } from '../../../../../lib/db';
import { unslug } from '../../../../../lib/area';
import styles from './page.module.css';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ForecastPage({
  params,
}: {
  params: Promise<{ state: string; city: string; place: string }>;
}) {
  const { state, city, place } = await params;
  const station = await getStationByPlace(unslug(state), unslug(city), unslug(place)).catch(() => null);
  if (!station) notFound();
  const base = `/${state}/${city}/${place}`;

  const [aqi, forecast, history] = await Promise.all([
    getAqiReading(station.id),
    getForecastResult(station.id),
    getReadingsHistory(station.id, 30),
  ]);

  // Build day-by-day cards for the next 7 days
  const days = forecast?.points?.slice(0, 7).map((p) => {
    const d = new Date(p.date + 'T00:00:00');
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      aqi: Math.round(p.predicted_aqi),
      bucket: aqiBucket(Math.round(p.predicted_aqi)),
      ci: [p.confidence_low, p.confidence_high],
    };
  }) ?? [];

  // History: take the last 30 readings (1/day averaged by day)
  const dayMap = new Map<string, number>();
  for (const r of history) {
    const d = new Date(r.recorded_at).toISOString().slice(0, 10);
    const cur = dayMap.get(d) ?? 0;
    dayMap.set(d, Math.max(cur, r.aqi));  // use max if multiple readings same day
  }
  const histSeries = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, aqi]) => ({ date: d, aqi }));

  const histPoints = histSeries.map(h => h.aqi);
  const fcPoints = forecast?.points?.map(p => p.predicted_aqi) ?? [];
  const allPoints = [...histPoints, ...fcPoints];
  if (allPoints.length === 0) {
    return (
      <main className={styles.main}>
        <p>No forecast available yet. The model needs at least 14 days of history.</p>
      </main>
    );
  }
  const maxY = Math.max(...allPoints, 250) + 20;
  const W = 1280, H = 320, PAD = 32;
  const xStep = (W - 2 * PAD) / Math.max(allPoints.length - 1, 1);

  const histPath = histPoints
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * xStep} ${H - PAD - (v / maxY) * (H - 2 * PAD)}`)
    .join(' ');
  const fcPath = fcPoints
    .map((v, i) => {
      const j = histPoints.length - 1 + i;
      return `${i === 0 ? 'M' : 'L'} ${PAD + j * xStep} ${H - PAD - (v / maxY) * (H - 2 * PAD)}`;
    })
    .join(' ');

  // Confidence band (drawn as two paths: top and bottom)
  const ciTop = forecast?.points?.map((p, i) => {
    const j = histPoints.length - 1 + i;
    return `${i === 0 ? 'M' : 'L'} ${PAD + j * xStep} ${H - PAD - (p.confidence_high / maxY) * (H - 2 * PAD)}`;
  }).join(' ') ?? '';
  const ciBot = forecast?.points?.map((p, i) => {
    const j = histPoints.length - 1 + i;
    const path = `${i === 0 ? 'L' : 'L'} ${PAD + j * xStep} ${H - PAD - (p.confidence_low / maxY) * (H - 2 * PAD)}`;
    return i === 0 ? `L ${PAD + j * xStep} ${H - PAD - (p.confidence_low / maxY) * (H - 2 * PAD)}` : path;
  }).reverse().join(' ') ?? '';
  const ciPath = ciTop ? `${ciTop} ${ciBot} Z` : '';

  const plainText = forecast
    ? `${station.place} AQI is forecast to hover around ${Math.round(forecast.points[0].predicted_aqi)} for the next few days. R² of the fit is ${forecast.r_squared.toFixed(2)} (0=no signal, 1=perfect fit).`
    : '';

  return (
    <main className={styles.main}>
      <div className={styles.crumb}>
        <Link href={base}>Home</Link> / <Link href={base}>{station.city}</Link> / <Link href={base}>{station.place}</Link> / <span className={styles.current}>Forecast</span>
      </div>
      <div className={styles.head}>
        <div>
          <h1 className={styles.h1}>7-day AQI forecast for {station.place}</h1>
          <p className={styles.headerSub}>
            Predicted from the last 30 days using linear regression. Confidence band shows 1 standard error.
            {aqi ? ` Latest reading: ${aqi.aqi} (${aqi.bucket}).` : ''}
          </p>
        </div>
        <ChangeLocationPill place={`${station.place}, ${station.city}`} />
      </div>

      <div className={styles.chartCard}>
        <div className={styles.chartHead}>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: 'var(--mod)' }} /> History (30 days)
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: 'var(--accent)' }} /> Forecast (7 days)
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendBand}`} /> Confidence band
            </span>
          </div>
          <div className={styles.r2}>
            Model fit (R²): <strong>{forecast?.r_squared.toFixed(2) ?? '–'}</strong>
          </div>
        </div>

        <div className={styles.plot}>
          <div className={`${styles.band} ${styles.bandGood}`}>GOOD</div>
          <div className={`${styles.band} ${styles.bandSat}`}>SAT</div>
          <div className={`${styles.band} ${styles.bandMod}`}>MOD</div>
          <div className={`${styles.band} ${styles.bandPoor}`}>POOR</div>
          <div className={`${styles.band} ${styles.bandVpoor}`}>V POOR</div>
          <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {histPoints.map((_, i) => (
              <line key={i} className={styles.grid} x1={PAD + i * xStep} y1={PAD} x2={PAD + i * xStep} y2={H - PAD} />
            ))}
            {histPoints.length > 0 && fcPoints.length > 0 && (
              <line
                className={styles.sep}
                x1={PAD + (histPoints.length - 1) * xStep}
                y1={0}
                x2={PAD + (histPoints.length - 1) * xStep}
                y2={H}
              />
            )}
            {ciPath && <path d={ciPath} fill="rgba(0,168,150,0.12)" stroke="none" />}
            <path className={styles.lineHist} d={histPath} />
            <path className={styles.lineFcst} d={fcPath} />
            {histPoints.map((v, i) => (
              <circle key={i} cx={PAD + i * xStep} cy={H - PAD - (v / maxY) * (H - 2 * PAD)} r="3" fill="var(--mod)" />
            ))}
            {fcPoints.map((v, i) => (
              <circle key={i} cx={PAD + (histPoints.length - 1 + i) * xStep} cy={H - PAD - (v / maxY) * (H - 2 * PAD)} r="3" fill="var(--accent)" />
            ))}
          </svg>
        </div>
      </div>

      <PlainEnglish text={plainText} />

      <section className={styles.days}>
        <h2 className={styles.daysH2}>Day-by-day</h2>
        <div className={styles.daysGrid}>
          {days.map((d, i) => (
            <div key={i} className={styles.dayCard}>
              <span className={styles.dayName}>{i === 0 ? 'Today' : d.label}</span>
              <span className={styles.dayDate}>{d.date}</span>
              <span className={styles.dayVal} style={{ color: `var(--${bucketVarName(d.bucket)})` }}>{d.aqi}</span>
              <span className={styles.dayLbl}>AQI · [{d.ci[0]}-{d.ci[1]}]</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function aqiBucket(aqi: number): string {
  if (aqi < 50) return 'Good';
  if (aqi < 100) return 'Satisfactory';
  if (aqi < 200) return 'Moderate';
  if (aqi < 300) return 'Poor';
  if (aqi < 400) return 'Very Poor';
  return 'Severe';
}

function bucketVarName(bucket: string): string {
  return ({
    Good: 'good',
    Satisfactory: 'sat',
    Moderate: 'mod',
    Poor: 'poor',
    'Very Poor': 'vpoor',
    Severe: 'severe',
  } as Record<string, string>)[bucket] ?? 'mod';
}
