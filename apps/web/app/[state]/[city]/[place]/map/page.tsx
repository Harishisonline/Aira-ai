/**
 * Map page — SVG-style map of Maharashtra stations with lat/lng projection.
 * Marker color matches AQI bucket. Click shows a name + AQI tooltip.
 *
 * The map is the same statewide view regardless of which /[state]/[city]/[place]
 * route you came from — there is only one Maharashtra.
 */

import Link from 'next/link';
import { ChangeLocationPill } from '../../../../../components/ChangeLocationPill';
import { getStationsWithAqi } from '../../../../../lib/db';
import { MapCanvas, type MapMarker } from './MapCanvas';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function project(lat: number, lng: number) {
  // Maharashtra approx bounds: lat 15.6–22.0, lng 72.6–80.9
  const minLat = 15.6, maxLat = 22.0, minLng = 72.6, maxLng = 80.9;
  const x = ((lng - minLng) / (maxLng - minLng)) * 720 + 40;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 520 + 40;
  return { x, y };
}

function aqiColor(aqi: number): string {
  if (aqi < 50) return 'var(--good)';
  if (aqi < 100) return 'var(--sat)';
  if (aqi < 200) return 'var(--mod)';
  if (aqi < 300) return 'var(--poor)';
  if (aqi < 400) return 'var(--vpoor)';
  return 'var(--severe)';
}

export default async function MapPage({
  params,
}: {
  params: Promise<{ state: string; city: string; place: string }>;
}) {
  const { state, city, place } = await params;
  const base = `/${state}/${city}/${place}`;
  const stations = await getStationsWithAqi('Maharashtra').catch(() => []);
  const sorted = [...stations].filter((s) => s.aqi != null);
  const top5Worst = [...sorted].sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0)).slice(0, 5);
  const top5Cleanest = [...sorted].sort((a, b) => (a.aqi ?? 0) - (b.aqi ?? 0)).slice(0, 5);

  const markers: MapMarker[] = stations.map((s) => {
    const aqi = s.aqi ?? 0;
    const { x, y } = s.lat && s.lng
      ? project(s.lat, s.lng)
      : (() => {
          const seed = ((s.id.charCodeAt(0) || 1) * 17 + (s.id.charCodeAt(1) || 1) * 13) % 1000;
          return { x: 200 + (seed % 600), y: 100 + ((seed * 7) % 400) };
        })();
    return { id: s.id, name: s.name, aqi, x, y, color: aqiColor(aqi) };
  });

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.h1}>Maharashtra AQI map</h1>
          <p className={styles.lede}>
            Every active CPCB monitoring station. Marker color matches the AQI bucket.
          </p>
        </div>
        <ChangeLocationPill place="Maharashtra" />
      </div>

      <div className={styles.layout}>
        <div className={styles.mapArea}>
          <MapCanvas markers={markers} />
        </div>

        <aside className={styles.sidebar}>
          <Link href={`${base}/compare`} className={styles.compareCta}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Compare two stations
          </Link>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>AQI legend</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--good)' }} /> Good (0-50)</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--sat)' }} /> Satisfactory (51-100)</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--mod)' }} /> Moderate (101-200)</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--poor)' }} /> Poor (201-300)</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--vpoor)' }} /> Very Poor (301-400)</div>
            <div className={styles.legendRow}><span className={styles.dot} style={{ background: 'var(--severe)' }} /> Severe (401+)</div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Top 5 worst right now</div>
            {top5Worst.map((s, i) => (
              <div key={s.id} className={styles.listRow}>
                <div className={styles.listLeft}>
                  <span className={styles.rank}>{i + 1}</span>
                  <span className={styles.name}>{s.name}</span>
                </div>
                <span className={styles.val} style={{ color: aqiColor(s.aqi ?? 0) }}>{s.aqi}</span>
              </div>
            ))}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>Top 5 cleanest right now</div>
            {top5Cleanest.map((s, i) => (
              <div key={s.id} className={styles.listRow}>
                <div className={styles.listLeft}>
                  <span className={styles.rank}>{i + 1}</span>
                  <span className={styles.name}>{s.name}</span>
                </div>
                <span className={styles.val} style={{ color: aqiColor(s.aqi ?? 0) }}>{s.aqi}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
