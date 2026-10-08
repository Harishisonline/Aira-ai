/**
 * ComparePanel — the "Compare with another area" entry point on the City
 * page. Two dropdowns + a Compare button that navigates to the Compare
 * page with ?a= and ?b= query params.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  placeOptions: { label: string; slug: string }[];
  currentPlace: string;
  currentPlaceLabel: string;
}

export function ComparePanel({ placeOptions, currentPlace, currentPlaceLabel }: Props) {
  const router = useRouter();
  const [a, setA] = useState(currentPlace);
  const [b, setB] = useState('andheri');

  function go() {
    router.push(`/maharashtra/mumbai/borivali/compare?a=${a}&b=${b}`);
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: 24,
      marginTop: 16,
    }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
        Compare with another area
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
        See this place side-by-side with another. Both areas must be in the same state in v1.
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Area 1</label>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 13, color: 'var(--text-1)', fontWeight: 500,
            }}
          >
            {placeOptions.map((p) => (
              <option key={p.slug} value={p.slug}>{p.label} · Maharashtra</option>
            ))}
          </select>
        </div>
        <div style={{ padding: '0 8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>vs</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Area 2</label>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 13, color: 'var(--text-1)', fontWeight: 500,
            }}
          >
            {placeOptions.map((p) => (
              <option key={p.slug} value={p.slug}>{p.label} · Maharashtra</option>
            ))}
          </select>
        </div>
        <button
          onClick={go}
          style={{
            padding: '10px 20px',
            background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Compare →
        </button>
      </div>
    </div>
  );
}
