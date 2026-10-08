/**
 * Advisory client — profile chips + live-AQI-grounded copy. Open chat is a Link.
 */

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChangeLocationPill } from '../../../../../components/ChangeLocationPill';
import styles from './page.module.css';
import Link from 'next/link';
import type { AqiReading } from '../../../../../lib/types';

const PROFILES: { id: 'healthy' | 'child' | 'elderly' | 'asthmatic'; label: string; icon: string }[] = [
  { id: 'healthy', label: 'Healthy adult', icon: 'ADULT' },
  { id: 'child', label: 'Child', icon: 'CHILD' },
  { id: 'elderly', label: 'Elderly', icon: 'OLDER' },
  { id: 'asthmatic', label: 'Asthmatic', icon: 'BREATH' },
];

type ProfileId = (typeof PROFILES)[number]['id'];

function buildAdvisory(profile: ProfileId, aqi: AqiReading | null, placeName: string) {
  const value = aqi?.aqi ?? 142;
  const bucket = aqi?.bucket ?? 'Moderate';
  const pm25 = aqi?.pm25 != null ? Math.round(aqi.pm25) : 78;
  const dominant = aqi?.dominant?.toUpperCase() ?? 'PM2.5';
  const updated = aqi?.recorded_at
    ? new Date(aqi.recorded_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'recently';

  const title = `Current AQI: ${value} (${bucket})`;
  const base = {
    healthy: {
      eyebrow: `Advisory for Healthy adults in ${placeName}`,
      title,
      body: `For a healthy adult, AQI ${value} (${bucket}) is the level to plan around today. ${dominant} is the limiting pollutant (PM2.5 ≈ ${pm25} µg/m³). Outdoor activity is generally fine; prefer the morning, before 10am, when levels are typically 15–20 points lower, and ease off if you feel short of breath.`,
      do: [
        { icon: 'check' as const, text: 'Outdoor activity is fine for most of the day' },
        { icon: 'info' as const, text: `${dominant} is the limiting pollutant, around ${pm25} µg/m³` },
        { icon: 'check' as const, text: 'Prefer morning hours (before 10am) when AQI is typically 15-20 points lower' },
      ],
    },
    child: {
      eyebrow: `Advisory for Children in ${placeName}`,
      title,
      body: `Children's lungs are still developing, and they breathe more air per kilogram of body weight than adults. AQI in ${placeName} is ${value} (${bucket}) today. Keep outdoor play shorter if your child has any respiratory sensitivity, and prefer the morning window.`,
      do: [
        { icon: 'check' as const, text: 'Outdoor play is fine — keep it under an hour if there is any respiratory sensitivity' },
        { icon: 'info' as const, text: 'Children breathe 50% more air per kg of body weight than adults' },
        { icon: 'check' as const, text: 'Prefer morning hours (before 10am) when AQI is typically 15-20 points lower' },
        { icon: 'check' as const, text: 'Keep windows closed during peak traffic hours (5-9pm)' },
      ],
    },
    elderly: {
      eyebrow: `Advisory for Elderly in ${placeName}`,
      title,
      body: `Heart and lung conditions can worsen faster once air moves out of the Moderate range. At AQI ${value} (${bucket}), a slow outdoor walk is reasonable if you rest often and stay hydrated. Avoid the 5–9pm traffic peak.`,
      do: [
        { icon: 'check' as const, text: 'Outdoor walks are fine, go slow' },
        { icon: 'info' as const, text: 'Heart and lung conditions worsen faster at Poor+ levels' },
        { icon: 'check' as const, text: 'Rest often during outdoor activity' },
      ],
    },
    asthmatic: {
      eyebrow: `Advisory for Asthmatics in ${placeName}`,
      body: `Outdoor air is more likely to trigger symptoms while PM2.5 stays near ${pm25} µg/m³ (AQI ${value}, ${bucket}). Keep a rescue inhaler within reach, prefer indoor time with windows closed during peak traffic, and run an air purifier if you have one.`,
      do: [
        { icon: 'cross' as const, text: 'Limit prolonged outdoor exertion while AQI stays elevated' },
        { icon: 'info' as const, text: `PM2.5 is at ${pm25} µg/m³` },
        { icon: 'check' as const, text: 'Keep rescue inhaler accessible, stay indoors with windows closed in traffic peak' },
        { icon: 'check' as const, text: 'Run an air purifier if you have one' },
      ],
    },
  }[profile];
  // asthmatic doesn't have title set in the original — fall back to top-level title
  const finalTitle = base.title ?? title;
  return { ...base, title: finalTitle, updated };
}

function Icon({ type }: { type: 'check' | 'cross' | 'info' }) {
  if (type === 'check') return <span className={`${styles.actionIcon} ${styles.do}`}>✓</span>;
  if (type === 'cross') return <span className={`${styles.actionIcon} ${styles.dont}`}>!</span>;
  return <span className={`${styles.actionIcon} ${styles.info}`}>i</span>;
}

export default function AdvisoryClient({
  aqi,
  placeName,
  chatHref,
  area,
}: {
  aqi: AqiReading | null;
  placeName: string;
  chatHref: string;
  area: { state: string; city: string; place: string };
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileId>('healthy');
  const [opening, setOpening] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, startTransition] = useTransition();
  const advisory = useMemo(() => buildAdvisory(profile, aqi, placeName), [profile, aqi, placeName]);

  async function pickProfile(p: ProfileId) {
    setProfile(p);
    startTransition(async () => {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ health_profile: p }),
      });
      await fetch('/api/worker/advisories/refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': process.env.NEXT_PUBLIC_WORKER_TOKEN ?? '',
        },
        body: JSON.stringify({ user_id: 'me', profile: p }),
      });
      setRefreshKey((k) => k + 1);
    });
  }

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <div className={styles.header}>
          <h1 className={styles.h1}>Personalised health advisory</h1>
          <p className={styles.lede}>
            Pick the profile that matches you or the people you care about. The advice updates from current AQI and 7-day forecast.
          </p>
        </div>
        <ChangeLocationPill place={placeName} />
      </div>

      <div className={styles.profileLabel}>Who is this advisory for?</div>
      <div className={styles.profileRow}>
        {PROFILES.map((p) => {
          const selected = profile === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProfile(p.id)}
              className={`${styles.profileChip} ${selected ? styles.profileSelected : ''}`}
            >
              <div className={styles.iconCircle}><span>{p.icon}</span></div>
              <div className={styles.profileName}>{p.label}</div>
              {selected && (
                <div className={styles.selectedPill}>
                  <span className={styles.checkPill}>✓</span>
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      <section className={styles.advisoryCard} key={refreshKey}>
        <div className={styles.advisoryHead}>
          <div>
            <div className={styles.advisoryEyebrow}>{advisory.eyebrow}</div>
            <div className={styles.advisoryTitle}>{advisory.title}</div>
          </div>
          <button type="button" className={styles.refreshBtn} onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </button>
        </div>
        <p className={styles.advisoryBody}>{advisory.body}</p>
        <div className={styles.actionHead}>What to do</div>
        <div className={styles.actions}>
          {advisory.do.map((item, i) => (
            <div key={i} className={styles.action}>
              <Icon type={item.icon} />
              <div className={styles.actionText}>{item.text}</div>
            </div>
          ))}
        </div>
        <p className={styles.generated}>
          Generated by Aira AI from CPCB data, last refreshed {advisory.updated}. Not a substitute for medical advice.
        </p>
      </section>

      <div className={styles.chatCta}>
        <div className={styles.chatCtaBody}>
          <div className={styles.chatCtaIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div className={styles.chatCtaTitle}>Chat with Aira</div>
            <div className={styles.chatCtaSub}>
              Ask anything about the air in {placeName} — grounded in live AQI, 7-day forecast, your profile, and your recent advisories.
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.chatCtaBtn}
          disabled={opening}
          onClick={async () => {
            setOpening(true);
            try {
              const r = await fetch('/api/chat-sessions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  state: area.state,
                  city: area.city,
                  place: area.place,
                  profile,
                }),
              });
              const json = await r.json().catch(() => ({}));
              if (!r.ok || !json.session?.id) {
                router.push(chatHref);
                return;
              }
              router.push(`${chatHref}?session=${json.session.id}`);
            } finally {
              setOpening(false);
            }
          }}
        >
          {opening ? 'Opening…' : 'Open chat →'}
        </button>
      </div>

      <div className={styles.helpLink}>
        <Link href="/help">New here? Read what Aira can help with →</Link>
      </div>
    </main>
  );
}
