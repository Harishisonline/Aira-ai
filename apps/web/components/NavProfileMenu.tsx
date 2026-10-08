/**
 * Signed-in avatar dropdown: Account, General, Health profile, Alerts, Sign out.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import styles from './Nav.module.css';

interface Props {
  user: { id?: string; email: string; display_name?: string; avatar_url?: string };
}

const MENU = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/general', label: 'General' },
  { href: '/settings/health-profile', label: 'Health profile' },
  { href: '/settings/alerts', label: 'Alerts' },
] as const;

export function NavProfileMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = (user.display_name || user.email || '?').charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    try {
      await supabase.auth.signOut();
    } catch {
      // A failed network call must not leave the button stuck. The next page loads signed out.
    }
    window.location.assign('/');
  }

  return (
    <div className={styles.profileRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.profilePill}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className={styles.profileAvatar}
          />
        ) : (
          <span className={styles.profileInitial} aria-hidden="true">{initial}</span>
        )}
        <span className={styles.profileName}>{user.display_name || user.email?.split('@')[0]}</span>
      </button>
      {open && (
        <div className={styles.profileMenu} role="menu">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={styles.profileMenuItem}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <button type="button" role="menuitem" className={styles.profileMenuDanger} onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
