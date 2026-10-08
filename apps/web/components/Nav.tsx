/**
 * Top nav. Server component (no 'use client'). Receives the signed-in user
 * from the layout, so we don't refetch the session here.
 *
 * Primary: Home, City, Compare, Map, Advisory
 * Secondary: Methodology, Help
 * Utility: Theme toggle, Settings, Sign in / profile menu
 */

import Link from 'next/link';
import { NavProfileMenu } from './NavProfileMenu';
import { SignInButton } from './SignInButton';
import { ThemeToggle } from './ThemeToggle';
import { BrandMark } from './BrandMark';
import styles from './Nav.module.css';
import type { UserRow } from '../lib/types';

function areaBase(user: UserRow | null): string {
  const state = (user?.default_state || 'maharashtra').toLowerCase();
  const city = (user?.default_city || 'mumbai').toLowerCase().replace(/ /g, '-');
  const place = (user?.default_place || 'borivali').toLowerCase().replace(/ /g, '-');
  return `/${state}/${city}/${place}`;
}

const NAV_SECONDARY = [
  { href: '/methodology', label: 'Methodology' },
  { href: '/help', label: 'Help' },
];

interface Props {
  user: UserRow | null;
  email: string | null;
  /** Optional: highlight one nav item as currently active */
  active?: string;
}

export function Nav({ user, email, active }: Props) {
  const base = areaBase(user);
  const settingsHref = user ? '/settings/account' : '/signin?next=/settings/account';
  const NAV_ITEMS = [
    { href: base, label: 'Home' },
    { href: `${base}/dashboard`, label: 'City' },
    { href: `${base}/compare`, label: 'Compare' },
    { href: `${base}/map`, label: 'Map' },
    { href: `${base}/advisory`, label: 'Advisory' },
  ];
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <BrandMark />
      </div>
      <div className={styles.links}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`${styles.primary} ${active === item.label ? styles.active : ''}`}
          >
            {item.label}
          </Link>
        ))}
        <span className={styles.divider} aria-hidden="true" />
        {NAV_SECONDARY.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`${styles.secondary} ${active === item.label ? styles.secondaryActive : ''}`}
          >
            {item.label}
          </Link>
        ))}
        <div className={styles.utility}>
          <ThemeToggle />
          <Link
            href={settingsHref}
            className={styles.settings}
            aria-label="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </Link>
          {user ? (
            <NavProfileMenu user={{ id: user.id, email: email ?? user.email ?? '', display_name: user.display_name ?? undefined, avatar_url: user.avatar_url ?? undefined }} />
          ) : (
            <SignInButton />
          )}
        </div>
      </div>
    </nav>
  );
}
