/**
 * Settings → Alerts. Email channel pill, threshold slider, daily cap
 * informational card, recent emails list. All emails are email-only in v1
 * (no browser push, no SMS).
 */

'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { SignInGate } from '../../../components/SignInGate';

interface Email { id: string; kind: string; subject: string; status: string; sent_at: string | null; created_at: string; related_place: string | null }

export default function AlertsSettings() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [threshold, setThreshold] = useState(200);
  const [emailsEnabled, setEmailsEnabled] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [saved, setSaved] = useState('');
  const [sampleBody, setSampleBody] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        return;
      }
      const { data: profile } = await supabase.from('users').select('email, alert_threshold, email_alerts_enabled, default_place, default_city').eq('id', user.id).single();
      setUser({ ...user, ...profile });
      setThreshold(profile?.alert_threshold ?? 200);
      setEmailsEnabled(profile?.email_alerts_enabled ?? true);
      const { data: log } = await supabase.from('email_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
      setEmails(log ?? []);
      const { data: advisory } = await supabase
        .from('advisories')
        .select('body_md, profile_type, generated_at')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (advisory?.body_md) {
        setSampleBody(String(advisory.body_md).slice(0, 420));
      }
      setAuthChecked(true);
    })();
  }, []);

  // Debounced save (500ms)
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(async () => {
      if (threshold === user.alert_threshold && emailsEnabled === user.email_alerts_enabled) return;
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alert_threshold: threshold, email_alerts_enabled: emailsEnabled }),
      });
      setSaved('✓ Saved');
      setTimeout(() => setSaved(''), 1500);
    }, 500);
    return () => clearTimeout(t);
  }, [threshold, emailsEnabled, user]);

  if (!authChecked) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking session…</div>;
  if (!user) return <SignInGate next="/settings/alerts" />;

  const bucketColor = threshold < 50 ? 'var(--good)' : threshold < 100 ? 'var(--sat)' : threshold < 200 ? 'var(--mod)' : threshold < 300 ? 'var(--poor)' : 'var(--vpoor)';
  const bucketLabel = threshold < 50 ? 'Good' : threshold < 100 ? 'Satisfactory' : threshold < 200 ? 'Moderate' : threshold < 300 ? 'Poor' : threshold < 400 ? 'Very Poor' : 'Severe';
  const placeLabel = [user.default_place, user.default_city].filter(Boolean).join(', ') || 'your area';

  return (
    
      <><h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Alerts</h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>Get notified when AQI in your default city crosses a threshold you care about. Email and threshold settings are available after sign-in.</p>

      <section style={panel}>
        <h2 style={h2}>Sample alert email</h2>
        <p style={sub}>What a threshold alert looks like when AQI crosses {threshold} in {placeLabel}.</p>
        <div style={{ marginTop: 12, padding: 16, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>To: {user.email}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
            🌫️ AQI just crossed {threshold} in {placeLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {sampleBody
              ?? `AQI in ${placeLabel} just crossed your alert threshold of ${threshold} (${bucketLabel}). Open Aira for the full advisory and 7-day forecast.`}
          </div>
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Email channel</h2>
        <p style={sub}>Aira sends alerts to your registered email. No browser push, no SMS in v1.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Send alerts to</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Subject lines: "🌫️ AQI just crossed [N] in [Place]" for threshold, "📬 AQI update for [Place] you asked for" for scheduled.</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 7px 7px 12px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--text-1)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{user.email}</span>
            <span style={{ padding: '3px 8px', background: 'var(--accent-tint)', color: '#006b5d', borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Verified</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Send me email alerts</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>Master switch. When OFF, no threshold alerts and Aira's chat can't schedule new emails either.</div>
          </div>
          <button onClick={() => setEmailsEnabled(!emailsEnabled)} style={{ position: 'relative', width: 40, height: 24, background: emailsEnabled ? 'var(--accent)' : 'var(--border)', border: 'none', borderRadius: 999, cursor: 'pointer' }}>
            <div style={{ position: 'absolute', top: 2, left: emailsEnabled ? 18 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
          </button>
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Alert threshold</h2>
        <p style={sub}>Trigger a warning email when AQI in your default area goes above this value. One email per crossing, not one per reading.</p>
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 800, color: bucketColor, lineHeight: 1 }}>{threshold}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>AQI in {user.default_place}, {user.default_city}</div>
            </div>
            <div style={{ flex: 1 }}>
              <input type="range" min={0} max={500} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: '100%' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center' }}>
                <span>0<br />Good</span>
                <span>100<br />Satisfactory</span>
                <span>200<br />Moderate</span>
                <span>300<br />Poor</span>
                <span>500<br />Severe</span>
              </div>
            </div>
            <div style={{ padding: '8px 12px', background: bucketColor, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{bucketLabel}</div>
          </div>
          {saved && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 8 }}>{saved}</div>}
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Daily cap</h2>
        <p style={sub}>How many emails Aira can send you in one day.</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 12, marginTop: 12 }}>
          <div style={{ width: 40, height: 40, background: 'var(--accent-tint)', color: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Up to 2 emails per day</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>The 2nd one will include a note about our upcoming subscription tier. After the cap, Aira won't send more until midnight IST. You can still chat, browse, and get threshold alerts the next day.</div>
          </div>
        </div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Recent emails</h2>
        <p style={sub}>The last 5 emails Aira sent you. Full history coming in v2.</p>
        {emails.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>No emails sent yet. The first one will appear here after your first AQI threshold crossing or scheduled report.</div>
        ) : emails.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ padding: '3px 8px', background: e.kind === 'threshold_alert' ? 'rgba(255,140,0,0.10)' : 'var(--accent-tint)', color: e.kind === 'threshold_alert' ? '#b06000' : '#006b5d', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', flexShrink: 0 }}>{e.kind === 'threshold_alert' ? 'THRESHOLD' : 'SCHEDULED'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{e.subject}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Sent {e.sent_at ? new Date(e.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'pending'}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: e.status === 'sent' ? 'var(--accent)' : 'var(--text-muted)' }}>{e.status === 'sent' ? 'Sent' : e.status}</span>
          </div>
        ))}
      </section></>
    
  );
}

const panel: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 };
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--text-2)' };
