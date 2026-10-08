/**
 * Settings → General. Default area (with Change area button), Appearance
 * (theme toggle, binary light/dark), Units (locked to metric in v1).
 *
 * The theme toggle uses the ThemeProvider context. The Change area button
 * navigates to /onboarding/area?from=general. Save is implicit.
 */

'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useTheme } from '../../../components/ThemeProvider';
import { SignInGate } from '../../../components/SignInGate';
import Link from 'next/link';

export default function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [inAppBadge, setInAppBadge] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        return;
      }
      const { data: profile } = await supabase.from('users').select('default_state, default_city, default_place, email_alerts_enabled').eq('id', user.id).single();
      setUser({ ...user, ...profile });
      setEmailAlerts(profile?.email_alerts_enabled ?? true);
      setAuthChecked(true);
    })();
  }, []);

  if (!authChecked) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking session…</div>;
  if (!user) return <SignInGate next="/settings/general" />;
  const area = `${user.default_state} · ${user.default_city} · ${user.default_place}`;

  return (
    <div> <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>General</h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>Default city, units, and display preferences. Changes save automatically to this browser.</p>

      <section style={panel}>
        <h2 style={h2}>Default area</h2>
        <p style={sub}>Pre-selected when you open the app. 28 places across Maharashtra.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Current area</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Used on the home page and as the fallback for forecasts and advisories.</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 999 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textTransform: 'capitalize' }}>{area}</span>
            <Link href="/onboarding/area?from=general" style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Change area →</Link>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Reset to Borivali</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Set your default area back to the Borivali starter location.</div>
          </div>
          <button onClick={async () => {
            const res = await fetch('/api/select-area', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'maharashtra', city: 'mumbai', place: 'Borivali', from: 'general' }) });
            const json = await res.json().catch(() => ({}));
            window.location.assign(json.redirect || '/settings/general');
          }} style={{ color: 'var(--accent)', background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Appearance</h2>
        <p style={sub}>Theme. Light is the default. No third "Auto" option — pick what you want, end of story.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Theme</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Saved to your account. Switches instantly with a 200ms cross-fade.</div>
          </div>
          <div style={{ display: 'inline-flex', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setTheme('light')} style={{ ...segItem, ...(theme === 'light' ? segActive : {}) }}>Light</button>
            <button onClick={() => setTheme('dark')} style={{ ...segItem, ...(theme === 'dark' ? segActive : {}) }}>Dark</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Units</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Pollutant concentrations in micrograms per cubic metre. Imperial coming in v2.</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Metric</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Locked in v1</span>
          </div>
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Notifications</h2>
        <p style={sub}>How Aira tells you about AQI changes.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>In-app indicator</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>A small badge on the nav when AQI crosses your threshold. Works only while the tab is open.</div>
          </div>
          <Toggle on={inAppBadge} onChange={setInAppBadge} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Email me when AQI crosses my threshold</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Subject: "🌫️ AQI just crossed [N] in [Place]". Up to 2 emails per day.</div>
          </div>
          <Toggle on={emailAlerts} onChange={async (next) => {
            setEmailAlerts(next);
            await fetch('/api/users/me', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email_alerts_enabled: next }),
            });
          }} />
        </div>
      </section></div>
  );
}

const panel: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 };
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--text-2)' };
const segItem: React.CSSProperties = { padding: '7px 14px', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer', borderRadius: 7 };
const segActive: React.CSSProperties = { background: 'var(--bg-card)', color: 'var(--text-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      style={{ position: 'relative', width: 40, height: 24, background: on ? 'var(--accent)' : 'var(--border)', borderRadius: 999, cursor: 'pointer', border: 'none', padding: 0 }}
    >
      <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
    </button>
  );
}
