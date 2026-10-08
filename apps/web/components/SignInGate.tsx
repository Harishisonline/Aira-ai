/**
 * Shown on settings pages when the visitor is not signed in.
 * Replaces the old forever "Loading…" branch (B1).
 */

import Link from 'next/link';

export function SignInGate({ next }: { next: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 32,
        maxWidth: 480,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
        Sign in to access settings
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>
        Account, health profiles, and alert preferences are saved to your Aira account.
      </p>
      <Link
        href={`/signin?next=${encodeURIComponent(next)}`}
        style={{
          display: 'inline-block',
          padding: '10px 18px',
          background: 'var(--primary)',
          color: '#fff',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Sign in →
      </Link>
    </div>
  );
}
