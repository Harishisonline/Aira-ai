/**
 * ChangeLocationPill — the "Maharashtra · Mumbai · Borivali" pill with a
 * chevron. Clicking it navigates to the onboarding picker. The pill's
 * text is passed as a prop so the same component works on every page.
 */

'use client';

import Link from 'next/link';

export function ChangeLocationPill({ place }: { place: string }) {
  return (
    <Link
      href="/onboarding/area"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-1)',
        textDecoration: 'none',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {place}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </Link>
  );
}
