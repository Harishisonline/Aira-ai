/**
 * Settings → Account. Identity card (avatar + display name + email + verified
 * badge), bio card, sign-in method card, active sessions, danger zone.
 *
 * The "Sign out everywhere" button calls POST /api/auth/signout-everywhere.
 * The "Delete account" button opens a confirmation modal then POSTs
 * /api/users/me/delete with the typed email for confirmation.
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { SignInGate } from '../../../components/SignInGate';

export default function AccountSettings() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);

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
      const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
      setUser({ ...user, ...profile });
      setDisplayName(profile?.display_name ?? user.email?.split('@')[0] ?? '');
      setBio(profile?.bio ?? '');
      setAuthChecked(true);
    })();
  }, []);

  // Debounced auto-save for display_name and bio (500ms after last keystroke)
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(async () => {
      if (displayName === user.display_name && bio === (user.bio ?? '')) return;
      const r = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, bio }),
      });
      if (r.ok) {
        setSaved('✓ Saved');
        setTimeout(() => setSaved(''), 1500);
      } else {
        const d = await r.json();
        setError(d.error ?? 'save failed');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [displayName, bio, user]);

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    const r = await fetch('/api/users/me/avatar', { method: 'POST', body: fd });
    if (r.ok) {
      const { avatar_url } = await r.json();
      setUser({ ...user, avatar_url });
      router.refresh();
    } else {
      const d = await r.json();
      setError(d.error ?? 'upload failed');
    }
  }

  async function signOutEverywhere() {
    await supabase.auth.signOut({ scope: 'global' });
    router.push('/');
  }

  async function deleteAccount() {
    if (confirmEmail.toLowerCase() !== (user.email ?? '').toLowerCase()) {
      setError('Email does not match');
      return;
    }
    const r = await fetch('/api/users/me/delete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // CSRF: server requires this header
        'x-requested-with': 'fetch',
      },
      body: JSON.stringify({ confirmEmail }),
    });
    if (r.ok) {
      await supabase.auth.signOut();
      router.push('/');
    } else {
      setError('delete failed');
    }
  }

  if (!authChecked) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking session…</div>;
  if (!user) return <SignInGate next="/settings/account" />;

  const initial = (displayName || user.email || '?').charAt(0).toUpperCase();

  return (
    <>
      {error && <div className="err">{error}</div>}

      {/* Identity card */}
      <section style={panelStyle}>
        <h2 style={sectionH2Style}>Identity</h2>
        <p style={sectionSubStyle}>Your name, photo, and email. Shown in the nav profile menu and on chat sessions.</p>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 16 }}>
          <div style={{ position: 'relative' }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="avatar" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg, #0f4c75 0%, #00a896 100%)', color: '#fff', fontSize: 40, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initial}</div>
            )}
            <button onClick={() => avatarInput.current?.click()} style={cameraBtnStyle} title="Change photo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} style={{ display: 'none' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} style={inputStyle} />
            <div style={hintStyle}>1-40 characters, trimmed.</div>

            <label style={{ ...labelStyle, marginTop: 16 }}>Email</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{user.email}</span>
              <span style={{ padding: '4px 8px', background: 'var(--accent-tint)', color: '#006b5d', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>✓ Verified</span>
            </div>
            <div style={hintStyle}>Member since {new Date(user.created_at ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</div>
            {saved && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 8 }}>{saved}</div>}
          </div>
        </div>
      </section>

      {/* Bio card */}
      <section style={panelStyle}>
        <h2 style={sectionH2Style}>Bio</h2>
        <p style={sectionSubStyle}>A short line shown under your name. Visible to you only.</p>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={hintStyle}>{bio.length} / 200</span>
          {saved && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{saved}</span>}
        </div>
      </section>

      {/* Sign-in method card */}
      <section style={panelStyle}>
        <h2 style={sectionH2Style}>Sign-in method</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 12, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ width: 40, height: 40, background: 'var(--bg-card)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Google</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Signed in with {user.email}</div>
          </div>
          <button onClick={signOutEverywhere} style={{ padding: '8px 16px', background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out everywhere</button>
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={sectionH2Style}>Active sessions</h2>
        <p style={sectionSubStyle}>Devices currently signed in to this account.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, padding: 12, background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>This device</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{user.email}</div>
          </div>
          <span style={{ padding: '4px 8px', background: 'var(--accent-tint)', color: '#006b5d', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Current session</span>
        </div>
        <button onClick={signOutEverywhere} style={{ marginTop: 12, padding: '8px 16px', background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out everywhere</button>
      </section>

      {/* Danger zone */}
      <section style={{ ...panelStyle, border: '1px solid rgba(220,53,69,0.30)' }}>
        <h2 style={{ ...sectionH2Style, color: 'var(--danger)' }}>Danger zone</h2>
        <p style={sectionSubStyle}>Permanent actions. Cannot be undone.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Delete account</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>Removes your user row, all chat sessions, all advisory history, and your avatar from storage. Hard delete, no recovery.</div>
          </div>
          <button onClick={() => setShowDeleteModal(true)} style={{ padding: '10px 18px', background: '#fff', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Delete account</button>
        </div>
      </section>

      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%' }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>Delete account permanently?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 12, lineHeight: 1.5 }}>Type your email <strong>{user.email}</strong> to confirm. This cannot be undone.</p>
            <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="Type your email" style={{ ...inputStyle, marginTop: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setShowDeleteModal(false)} style={{ padding: '10px 18px', background: 'var(--bg-page)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteAccount} style={{ padding: '10px 18px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const panelStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 };
const sectionH2Style: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 };
const sectionSubStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text-2)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit' };
const hintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginTop: 6 };
const cameraBtnStyle: React.CSSProperties = { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
