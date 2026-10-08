/**
 * Advisory page — server wrapper loads live AQI, client handles profile UI.
 */

import { notFound } from 'next/navigation';
import { getAqiReading, getStationByPlace } from '../../../../../lib/db';
import { unslug } from '../../../../../lib/area';
import AdvisoryClient from './AdvisoryClient';

export const dynamic = 'force-dynamic';

export default async function AdvisoryPage({
  params,
}: {
  params: Promise<{ state: string; city: string; place: string }>;
}) {
  const { state, city, place } = await params;
  const station = await getStationByPlace(unslug(state), unslug(city), unslug(place)).catch(() => null);
  if (!station) notFound();
  const aqi = await getAqiReading(station.id).catch(() => null);
  const placeName = `${station.place}, ${station.city}`;
  const chatHref = `/${state}/${city}/${place}/advisory/chat`;
  return (
    <AdvisoryClient
      aqi={aqi}
      placeName={placeName}
      chatHref={chatHref}
      area={{ state: station.state, city: station.city, place: station.place }}
    />
  );
}
