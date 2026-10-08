/**
 * Sign-in. Visual contract: assets/ui-mockups/07-signin.html.
 * Create account stores an email and password (confirmation email only).
 * Later visits use that password. Google and Apple stay as optional providers.
 */

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { BrandMark } from '../../components/BrandMark';
import styles from './page.module.css';

const AFTER_AUTH = '/onboarding/area?from=general';

export default function SignInPage() {
  const search = useSearchParams();
  const next = safeNext(search.get('next') ?? search.get('redirect'));
  const [mode, setMode] = useState<'signin' | 'signup'>(search.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(search.get('error') ?? '');
  const [success, setSuccess] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  function callbackUrl(target = next) {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    setError('');
    setSuccess('');
    const settingsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`;
    try {
      const res = await fetch(settingsUrl, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      });
      const settings = await res.json();
      if (!settings?.external?.[provider]) {
        const label = provider === 'google' ? 'Google' : 'Apple';
        setError(`${label} sign-in is not enabled on this Supabase project. Turn on the ${label} provider under Authentication → Providers, then try again.`);
        return;
      }
    } catch {
      setError('Could not reach the sign-in service.');
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setError(oauthError.message);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const address = email.trim();
    if (!address) {
      setError('Enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (signUpError && /already registered|already been registered/i.test(signUpError.message)) {
        sessionStorage.setItem('aira.pendingPassword', password);
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: address,
          options: {
            emailRedirectTo: callbackUrl('/auth/set-password'),
            shouldCreateUser: false,
          },
        });
        setBusy(false);
        if (otpError) {
          sessionStorage.removeItem('aira.pendingPassword');
          setError(otpError.message);
          return;
        }
        setSuccess('This email already has an account with no password. We sent a one-time link. Open it on this browser and the password you just typed will be saved.');
        return;
      }
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        window.location.assign(next);
        return;
      }
      setSuccess('Account created. Check your email and open the confirmation link, then sign in with this email and password.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? 'That email and password did not match. If this account was created with a magic link, open Create account and set a password for it.'
          : signInError.message,
      );
      return;
    }
    window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in did not finish. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.brand}>
        <div className={styles.brandTop}><BrandMark /></div>
        <div className={styles.brandHero}>
          <h2>Know the air your family breathes.</h2>
          <p>Real-time AQI, 7-day forecasts, and personalised health advice for every Maharashtra city. Backed by CPCB data, explained by AI.</p>
          <div className={styles.stats}>
            <div className={styles.stat}><div className={styles.statNum}>28</div><div className={styles.statLabel}>Live stations</div></div>
            <div className={styles.stat}><div className={styles.statNum}>7-day</div><div className={styles.statLabel}>Forecast</div></div>
            <div className={styles.stat}><div className={styles.statNum}>4</div><div className={styles.statLabel}>Health profiles</div></div>
          </div>
        </div>
        <div className={styles.brandFoot}>
          <Link href="/methodology">Methodology</Link>
          <Link href="/help">Help</Link>
          <Link href="/settings/about">About</Link>
          <a href="mailto:harishp0132@gmail.com">Contact</a>
          <span className={styles.version}>v1 - Maharashtra</span>
        </div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.formWrap}>
          <div className={styles.eyebrow}>Account</div>
          <h1>{mode === 'signup' ? 'Create an account' : 'Sign in to Aira AI'}</h1>
          <p className={styles.formSub}>Save your default city, sync your advisory profile across devices, and get threshold alerts when AQI crosses your sensitivity.</p>

          <div className={styles.tabs}>
            <button type="button" className={mode === 'signin' ? styles.tabActive : styles.tab} onClick={() => setMode('signin')}>Sign in</button>
            <button type="button" className={mode === 'signup' ? styles.tabActive : styles.tab} onClick={() => setMode('signup')}>Create account</button>
          </div>

          {error && <div className={styles.error} role="alert">{error}</div>}
          {success && <div className={styles.success} role="status">{success}</div>}

          <div className={styles.oauthRow}>
            <button type="button" className={styles.oauthBtn} onClick={() => signInWithProvider('google')}>
              <GoogleIcon />
              Continue with Google
            </button>
            <button type="button" className={styles.oauthBtn} onClick={() => signInWithProvider('apple')}>
              <AppleIcon />
              Continue with Apple
            </button>
          </div>

          <div className={styles.divider}>Or continue with email</div>

          <form onSubmit={onSubmit}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="email">Email</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                </span>
                <input id="email" className={styles.input} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="password">Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </span>
                <input id="password" className={styles.input} type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} />
              </div>
            </div>

            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className={styles.magicNote}>
            {mode === 'signup'
              ? 'Creating an account emails a confirmation link once. After that, sign in with this password.'
              : 'Sign in with the password you set when you created the account.'}
          </div>

          <div className={styles.v2}>
            <div className={styles.v2Icon}>i</div>
            <div>
              <strong>v2 preview.</strong> Aira AI is currently public and read-only. Signing in is a preview of what&apos;s coming: saved preferences, threshold alerts, and advisory history.
            </div>
          </div>

          <div className={styles.formFoot}>
            {mode === 'signup' ? (
              <>Already have an account? <button type="button" onClick={() => setMode('signin')}>Sign in</button></>
            ) : (
              <>New to Aira AI? <button type="button" onClick={() => setMode('signup')}>Create an account</button></>
            )}
          </div>

          <div className={styles.guestNote}>
            <Link href={next === AFTER_AUTH ? '/' : next}>Continue without signing in →</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return AFTER_AUTH;
  if (value === '/' || value === '/signin' || value.startsWith('/signin?')) return AFTER_AUTH;
  return value;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12-1.17.43-2.31 1.1-3.08.74-.85 2.05-1.5 3.064-1.57zM20.5 17.36c-.55 1.28-.81 1.85-1.51 2.98-.98 1.58-2.36 3.55-4.07 3.56-1.52.02-1.91-.99-3.97-.98-2.06.01-2.49 1-4.01.98-1.71-.02-3.02-1.79-4-3.37C.69 16.42-.18 11.36 1.66 8.04 2.84 5.94 4.86 4.65 6.95 4.65c2.13 0 3.47 1.16 5.23 1.16 1.71 0 2.75-1.17 5.22-1.17 1.86 0 3.83 1.01 5.22 2.77-4.59 2.51-3.84 9.07.93 9.95z" />
    </svg>
  );
}
