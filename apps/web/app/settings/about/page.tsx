/**
 * Settings → About. Matches assets/ui-mockups/12-about.html.
 * App Nav and the settings sidebar come from the layouts.
 */

'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';

export default function AboutSettings() {
  function exportPreferences() {
    const payload = {
      theme: localStorage.getItem('aira.theme') ?? 'light',
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aira-preferences.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetPreferences() {
    localStorage.removeItem('aira.theme');
    document.documentElement.removeAttribute('data-theme');
    window.location.href = '/';
  }

  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/maharashtra/mumbai/borivali" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Settings</span>
        {' / '}
        <span style={{ color: 'var(--text-2)' }}>About</span>
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>About Aira AI</h1>
      <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24, maxWidth: 720 }}>
        App version, data sources, methodology, and credits.
      </p>

      <section style={hero}>
        <div style={tag}>Aira AI v1.0</div>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12, color: '#fff' }}>
          Know the air your family breathes.
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.78)', maxWidth: 640 }}>
          Aira AI is built by Harish as a Sem III mini-project. Real-time AQI from the CPCB network, 7-day forecasts via linear regression, and Groq-powered health advisories. Maharashtra first; other states in v2.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 24 }}>
          {[
            ['28', 'Live stations'],
            ['6', 'Pollutants tracked'],
            ['7-day', 'Linear-reg forecast'],
            ['4', 'Health profiles'],
          ].map(([num, lbl]) => (
            <div key={lbl}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{num}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={panel}>
        <div style={head}><div style={title}>App information</div></div>
        <div style={body}>
          <Row label="Version" value="1.0.0" muted="(build 2026.01.14)" />
          <Row label="Region" value="Maharashtra, India" />
          <Row label="Last data refresh" value="Hourly" muted="from CPCB CCR API" />
          <Row label="License" value="MIT" muted="(source code on GitHub)" />
          <Row label="Built by" value="Harish · AI Club TSEC, Mumbai" />
        </div>
      </section>

      <section style={panel}>
        <div style={head}>
          <div style={title}>Data sources and references</div>
          <div style={sub}>Every reading on Aira AI comes from public, open APIs. We do not modify, average, or re-publish raw measurements.</div>
        </div>
        <div style={{ ...body, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Source title="CPCB Continuous Ambient Air Quality Monitoring System" text="28 active stations in Maharashtra, hourly readings via the official CCR API." />
          <Source title="CPCB National AQI Computation Method (2014)" text="the official NAQI formula, not the US EPA formula." />
          <Source title="WHO Global Air Quality Guidelines (2021)" text="reference for health advisories and safe thresholds." />
          <Source title="Indian Medical Association" text="Air Pollution and Public Health guidance, 2023." />
        </div>
      </section>

      <section style={panel}>
        <div style={head}><div style={title}>Links</div></div>
        <div style={body}>
          <LinkRow label="Methodology" desc="How Aira AI computes AQI and forecasts it." href="/methodology" action="View →" />
          <LinkRow label="Source code" desc="GitHub repository, MIT licensed." href="https://github.com/Harishisonline/Aira-ai" action="Open →" external />
          <LinkRow label="Privacy policy" desc="What we collect (almost nothing) and why." href="/help#privacy" action="Read →" />
          <LinkRow label="Contact" desc="harishp0132@gmail.com · usually replies within a day." href="mailto:harishp0132@gmail.com" action="Email →" />
        </div>
      </section>

      <section style={panel}>
        <div style={head}><div style={title}>Reset</div></div>
        <div style={body}>
          <div style={danger}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--vpoor)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Danger zone</div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
              Resetting clears local preferences (theme). Data already fetched from CPCB will be refetched on the next visit.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={exportPreferences} style={btnSecondary}>Export preferences</button>
              <button type="button" onClick={resetPreferences} style={btnDanger}>Reset all preferences</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>
        {value}{muted ? <span style={{ fontWeight: 400, color: 'var(--text-2)' }}> {muted}</span> : null}
      </span>
    </div>
  );
}

function Source({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-2)' }}>
      <strong style={{ color: 'var(--text-1)' }}>{title}</strong>
      <span>· {text}</span>
    </div>
  );
}

function LinkRow({ label, desc, href, action, external }: { label: string; desc: string; href: string; action: string; external?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{desc}</div>
      </div>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{action}</a>
      ) : (
        <Link href={href} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{action}</Link>
      )}
    </div>
  );
}

const hero: CSSProperties = {
  background: 'linear-gradient(135deg, var(--primary) 0%, #0a3553 100%)',
  borderRadius: 16,
  padding: '32px 36px',
  color: '#fff',
  marginBottom: 16,
};
const tag: CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  background: 'rgba(0,168,150,0.15)',
  padding: '4px 10px',
  borderRadius: 999,
  marginBottom: 16,
};
const panel: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 16 };
const head: CSSProperties = { padding: '20px 24px 12px', borderBottom: '1px solid var(--border)' };
const title: CSSProperties = { fontSize: 17, fontWeight: 600 };
const sub: CSSProperties = { fontSize: 13, color: 'var(--text-2)', marginTop: 4 };
const body: CSSProperties = { padding: '8px 24px 20px' };
const danger: CSSProperties = { padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12 };
const btnSecondary: CSSProperties = { padding: '8px 14px', background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnDanger: CSSProperties = { padding: '8px 14px', background: 'var(--vpoor)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
