/**
 * Settings → Health profile. List / add / edit / delete named profiles.
 * Wired to POST /api/user/profile and PATCH|DELETE /api/user/profile/[id].
 */

'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { SignInGate } from '../../../components/SignInGate';

interface Profile {
  id: string;
  name: string;
  profile_type: string;
  is_default: boolean;
  personal_threshold: number;
  conditions: string[];
}

const PROFILE_TYPES = ['healthy', 'child', 'elderly', 'asthmatic'] as const;

const emptyForm = {
  name: '',
  profile_type: 'healthy' as string,
  personal_threshold: 200,
  conditions: '',
};

export default function HealthProfileSettings() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSignedIn(false);
      setAuthChecked(true);
      return;
    }
    setSignedIn(true);
    const res = await fetch('/api/user/profile');
    if (res.ok) {
      const { profiles: rows } = await res.json();
      setProfiles(rows ?? []);
    }
    setAuthChecked(true);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setAdding(true);
    setError('');
  }

  function openEdit(p: Profile) {
    setAdding(false);
    setEditing(p);
    setForm({
      name: p.name,
      profile_type: p.profile_type,
      personal_threshold: p.personal_threshold,
      conditions: (p.conditions ?? []).join(', '),
    });
    setError('');
  }

  function closeForm() {
    setAdding(false);
    setEditing(null);
    setForm(emptyForm);
    setError('');
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      profile_type: form.profile_type,
      personal_threshold: Number(form.personal_threshold) || 200,
      conditions: form.conditions
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    };
    try {
      const res = editing
        ? await fetch(`/api/user/profile/${editing.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/user/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/user/profile/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      // Clear other defaults via API if needed — also unset locally via reload
      for (const p of profiles) {
        if (p.id !== id && p.is_default) {
          await fetch(`/api/user/profile/${p.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ is_default: false }),
          });
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile(id: string) {
    if (!confirm('Remove this health profile?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/user/profile/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking session…</div>;
  if (!signedIn) return <SignInGate next="/settings/health-profile" />;

  const showForm = adding || editing;

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Health profile</h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
        Who is Aira&apos;s advice for? You can have up to 4 named profiles.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={saveForm} style={{ ...panel, marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
            {editing ? 'Edit profile' : 'Add profile'}
          </h2>
          <label style={label}>Name</label>
          <input
            required
            maxLength={40}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='e.g. Mom — Elderly'
            style={input}
          />
          <label style={label}>Type</label>
          <select
            value={form.profile_type}
            onChange={(e) => setForm({ ...form, profile_type: e.target.value })}
            style={input}
          >
            {PROFILE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label style={label}>Personal AQI threshold</label>
          <input
            type="number"
            min={0}
            max={500}
            value={form.personal_threshold}
            onChange={(e) => setForm({ ...form, personal_threshold: Number(e.target.value) })}
            style={input}
          />
          <label style={label}>Conditions (comma-separated)</label>
          <input
            value={form.conditions}
            onChange={(e) => setForm({ ...form, conditions: e.target.value })}
            placeholder="asthma, COPD"
            style={input}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" disabled={busy} style={primaryBtn}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create profile'}
            </button>
            <button type="button" onClick={closeForm} style={ghostBtn}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {profiles.map((p) => (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={chip}>{p.profile_type}</span>
              {p.is_default && <span style={defaultChip}>Default</span>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</div>
            {p.conditions?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {p.conditions.map((c) => (
                  <span key={c} style={condChip}>{c}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              Personal AQI threshold: {p.personal_threshold}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openEdit(p)} style={secondaryBtn}>Edit</button>
              {!p.is_default && (
                <button type="button" style={linkBtn} onClick={() => setDefault(p.id)} disabled={busy}>
                  Set as default
                </button>
              )}
              {!p.is_default && (
                <button type="button" style={dangerBtn} onClick={() => removeProfile(p.id)} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {profiles.length < 4 && !showForm && (
          <button type="button" onClick={openAdd} style={addCard}>
            + Add profile
          </button>
        )}
      </div>
    </>
  );
}

const panel: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 24,
};
const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
};
const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginTop: 12,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--bg-page)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--text-1)',
  fontFamily: 'inherit',
};
const chip: React.CSSProperties = {
  padding: '2px 8px',
  background: 'var(--bg-page)',
  color: 'var(--text-2)',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const defaultChip: React.CSSProperties = {
  padding: '2px 8px',
  background: 'var(--accent-tint)',
  color: 'var(--accent)',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
};
const condChip: React.CSSProperties = {
  padding: '2px 8px',
  background: 'var(--bg-page)',
  color: 'var(--text-2)',
  borderRadius: 6,
  fontSize: 11,
};
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--bg-page)',
  color: 'var(--text-1)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--bg-page)',
  color: 'var(--text-1)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--accent)',
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
const dangerBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--danger)',
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
const addCard: React.CSSProperties = {
  background: 'transparent',
  border: '2px dashed var(--border)',
  borderRadius: 12,
  padding: 20,
  minHeight: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
