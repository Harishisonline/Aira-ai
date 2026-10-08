/**
 * Landing page — mockup 00-landing.html. Own marketing topbar (no app Nav).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '../lib/supabase/server';
import { homeForProfile } from '../lib/area';
import { BrandMark } from '../components/BrandMark';
import styles from './page.module.css';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    if (!user.user_metadata?.area_selected) {
      redirect('/onboarding/area?from=general');
    }
    const { data: profile } = await supabase
      .from('users')
      .select('default_state, default_city, default_place')
      .eq('id', user.id)
      .maybeSingle();
    redirect(homeForProfile(profile));
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.topbar}>
          <div className={styles.brand}><BrandMark /></div>
          <nav className={styles.topbarLinks}>
            <a href="#how">How it works</a>
            <Link href="/methodology">Methodology</Link>
            <Link href="/help">Help</Link>
            <Link href="/settings/about">About</Link>
            <Link href="/signin" className={styles.topbarCta}>Sign in</Link>
          </nav>
        </div>

        <div className={styles.heroBody}>
          <div className={styles.eyebrow}>Maharashtra · v1.0</div>
          <h1 className={styles.h1}>
            Know the air your <span className={styles.accent}>family</span> breathes.
          </h1>
          <p className={styles.heroSub}>
            Real-time AQI, 7-day forecasts, and personalised health advice for every place in Maharashtra.
            Backed by CPCB data, explained by AI, grounded in your location and your family.
          </p>
          <Link href="/signin" className={styles.heroCta}>
            Sign in to get started
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>

      <section className={styles.strip}>
        <div className={styles.stat}>
          <div className={styles.statNum}>28</div>
          <div className={styles.statLabel}>Live CPCB stations</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>7-day</div>
          <div className={styles.statLabel}>Linear-reg forecast</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>4</div>
          <div className={styles.statLabel}>Health profiles</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>Groq</div>
          <div className={styles.statLabel}>Tailored advisory</div>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h3>Live from every CPCB station</h3>
          <p>28 monitoring stations across Maharashtra, refreshed every hour. Pick your place, see the air around you.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h3>7-day forecast that tells the truth</h3>
          <p>Linear regression on the last 30 days, with a confidence band. No black-box ML, no marketing-grade hype.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h3>Advisory that knows who you are</h3>
          <p>Pick a profile: healthy adult, child, elderly, asthmatic. Get a tailored advisory from Groq, grounded in your real AQI.</p>
        </div>
      </section>

      <section className={styles.howitworks} id="how">
        <div>
          <h2>Three steps, then the air is yours.</h2>
          <p>
            Sign in, pick your place in Maharashtra, and Aira AI does the rest. Forecasts update every hour.
            Advisories refresh on demand. Chat with Aira whenever you want a personalised answer.
          </p>
        </div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepText}>
              <strong>Sign in</strong>
              <span>Email magic link, Google, or Apple. No password. Less than 30 seconds.</span>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepText}>
              <strong>Pick your place</strong>
              <span>City and locality. Borivali, Bandra, Andheri, Pune, Nagpur, Nashik — and 22 more.</span>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepText}>
              <strong>Use Aira AI</strong>
              <span>Live dashboard, 7-day forecast, station map, health advisory, and chat with Aira grounded in your real AQI.</span>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.foot}>
        <div>v1.0 · Maharashtra · Built by Harish</div>
        <div>
          <Link href="/methodology">Methodology</Link>
          <Link href="/help#privacy">Privacy</Link>
          <a href="mailto:hello@aira.ai">Contact</a>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
