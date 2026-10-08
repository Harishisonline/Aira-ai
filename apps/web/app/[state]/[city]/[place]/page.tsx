/**
 * Area home for any Maharashtra place. The Borivali path is also served
 * by the more specific static route; this covers every other station.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AqiCard } from '../../../../components/AqiCard';
import { ChangeLocationPill } from '../../../../components/ChangeLocationPill';
import { DestinationCard } from '../../../../components/DestinationCard';
import { getAqiReading, getStationByPlace } from '../../../../lib/db';
import { unslug } from '../../../../lib/area';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AreaHome({
  params,
}: {
  params: Promise<{ state: string; city: string; place: string }>;
}) {
  const { state, city, place } = await params;
  const station = await getStationByPlace(unslug(state), unslug(city), unslug(place)).catch(() => null);
  if (!station) notFound();
  const aqi = await getAqiReading(station.id).catch(() => null);
  const base = `/${state}/${city}/${place}`;

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.eyebrow}>Today across Maharashtra</div>
            <h1 className={styles.h1}>{station.place}, {station.city}</h1>
          </div>
          <ChangeLocationPill place={`${station.place}, ${station.city}`} />
        </div>
        <p className={styles.lede}>
          Live AQI from 28 monitoring stations across the state. Updated every hour from CPCB.
        </p>
      </section>

      {aqi && (
        <div className={styles.aqiWrap}>
          <AqiCard aqi={aqi} />
        </div>
      )}

      <section className={styles.destSection}>
        <h2 className={styles.h2}>Where would you like to look?</h2>
        <div className={styles.destGrid}>
          <DestinationCard
            icon="CITY"
            title="City Dashboard"
            subtitle="Live AQI for any Maharashtra city."
            href={`${base}/dashboard`}
          />
          <DestinationCard
            icon="CHART"
            title="7-Day Forecast"
            subtitle="Predicts air quality a week ahead."
            href={`${base}/forecast`}
          />
          <DestinationCard
            icon="MAP"
            title="Station Map"
            subtitle="Every CPCB monitor on one map."
            href={`${base}/map`}
          />
          <DestinationCard
            icon="HEART"
            title="Health Advisory"
            subtitle="Tailored advice for your profile."
            href={`${base}/advisory`}
          />
          <DestinationCard
            icon="VS"
            title="Compare Areas"
            subtitle="Side-by-side AQI for any two Maharashtra places."
            href={`${base}/compare`}
          />
        </div>
      </section>
    </main>
  );
}
