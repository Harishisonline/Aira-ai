/**
 * Select your area — mockup 13. 3-step state → city → place. No app Nav.
 *
 * v1 has the state locked to Maharashtra, so step 1 is informational
 * (a single read-only chip with a "Continue" button). The wizard UI
 * still flows through 3 steps to match the mockup and the PRD §5.9.
 */

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrandMark } from '../../../components/BrandMark';
import styles from './page.module.css';

const CITIES = [
  { name: 'Mumbai', places: ['Borivali', 'Bandra', 'Andheri', 'Colaba', 'Navi Mumbai', 'Thane'] },
  { name: 'Pune', places: ['Kothrud', 'Swargate'] },
  { name: 'Nagpur', places: ['Civil Lines', 'Ramdaspeth'] },
  { name: 'Nashik', places: ['Gangapur'] },
  { name: 'Aurangabad', places: ['CIDCO'] },
  { name: 'Solapur', places: ['Bhavani Peth'] },
  { name: 'Kolhapur', places: ['Rankala'] },
  { name: 'Sangli', places: ['Vishrambaug'] },
];

export default function SelectAreaPage() {
  const search = useSearchParams();
  const from = search.get('from') ?? 'onboarding';
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [city, setCity] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function apply() {
    setSubmitting(true);
    const r = await fetch('/api/select-area', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'maharashtra', city: city!, place: place!, from }),
    });
    if (r.ok) {
      const { redirect } = await r.json();
      window.location.assign(redirect);
    } else {
      setSubmitting(false);
    }
  }

  async function skip() {
    setSubmitting(true);
    const r = await fetch('/api/select-area', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'maharashtra', city: 'mumbai', place: 'Borivali', from }),
    });
    if (r.ok) {
      const { redirect } = await r.json();
      window.location.assign(redirect);
    }
  }

  // Steps can be clicked to go back (but not forward).
  function goToStep(target: 1 | 2 | 3) {
    if (target < step) setStep(target);
  }

  return (
    <div className={styles.layout}>
      <div className={styles.topBrand}><BrandMark /></div>
      <div className={styles.card}>
        <div className={styles.lockedPill}>
          <span className={styles.lockIcon} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          Maharashtra
          <span className={styles.lockedHint}>locked for v1</span>
        </div>
        <h1 className={styles.h1}>Pick your area</h1>
        <p className={styles.lede}>
          Choose the city you live in, then the locality within it. Aira AI will use this to show your real-time AQI, forecast, and advisory. You can change it any time.
        </p>

        <div className={styles.steps}>
          <button
            type="button"
            onClick={() => goToStep(1)}
            className={`${styles.step} ${step === 1 ? styles.stepActive : styles.stepDone}`}
            aria-label="Step 1: Pick state"
          >
            <div className={styles.stepNum}>{step > 1 ? '✓' : '1'}</div>
            Pick state
          </button>
          <div className={styles.stepLine} />
          <button
            type="button"
            onClick={() => goToStep(2)}
            disabled={step < 2}
            className={`${styles.step} ${step === 2 ? styles.stepActive : step > 2 ? styles.stepDone : ''}`}
            aria-label="Step 2: Pick city"
          >
            <div className={styles.stepNum}>{step > 2 ? '✓' : '2'}</div>
            Pick city
          </button>
          <div className={styles.stepLine} />
          <button
            type="button"
            onClick={() => goToStep(3)}
            disabled={step < 3}
            className={`${styles.step} ${step === 3 ? styles.stepActive : ''}`}
            aria-label="Step 3: Pick place"
          >
            <div className={styles.stepNum}>3</div>
            Pick place
          </button>
        </div>

        {step === 1 && (
          <>
            <div className={styles.stepLabel}>Pick state</div>
            <div className={styles.stateGrid}>
              <div className={`${styles.stateChip} ${styles.stateChipActive}`}>
                <span className={styles.optionIcon} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                  </svg>
                </span>
                <span>
                  <div className={styles.stateName}>Maharashtra</div>
                  <div className={styles.stateMeta}>Only state available in v1</div>
                </span>
                <span className={styles.stateCheck} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className={styles.stepLabel}>Pick city</div>
            <div className={styles.grid}>
              {CITIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => { setCity(c.name); setPlace(null); setStep(3); }}
                  className={styles.cityCard}
                >
                  <span className={styles.optionIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
                    </svg>
                  </span>
                  <span>
                    <div className={styles.cityName}>{c.name}</div>
                    <div className={styles.cityMeta}>{c.places.length} places</div>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && city && (
          <>
            <div className={styles.placesHeader}>
              <span>Showing places in</span> <strong>{city}</strong>
              <button type="button" onClick={() => setStep(2)} className={styles.changeCity}>Change city</button>
            </div>
            <div className={styles.stepLabel}>Pick place</div>
            <div className={styles.places}>
              {CITIES.find((c) => c.name === city)!.places.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlace(p)}
                  className={`${styles.placeCard} ${place === p ? styles.placeCardActive : ''}`}
                >
                  <div className={styles.placeName}>{p}</div>
                  <div className={styles.placeMeta}>Maharashtra · {city}</div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className={styles.footer}>
          {step === 2 && (
            <button type="button" onClick={() => setStep(1)} className={styles.btnLink}>← Back</button>
          )}
          {step === 3 && (
            <button type="button" onClick={() => setStep(2)} className={styles.btnLink}>← Back</button>
          )}

          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className={styles.btnPrimary}
            >
              Continue
            </button>
          )}

          {step === 3 && place && (
            <button type="button" onClick={apply} disabled={submitting} className={styles.btnPrimary}>
              {submitting ? 'Saving…' : 'Apply'}
            </button>
          )}

          {step === 3 && (
            <button type="button" onClick={skip} disabled={submitting} className={styles.btnLink}>
              Skip for now (Borivali)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
