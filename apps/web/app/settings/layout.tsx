/**
 * Settings layout (Next.js App Router convention).
 *
 * Wraps every page under /settings/* with a sidebar + main content slot.
 * The active item is derived from the current pathname so we don't need
 * to pass an `active` prop from each page.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

const ITEMS = [
  { href: '/settings/account', label: 'Account', icon: '👤' },
  { href: '/settings/general', label: 'General', icon: '⚙' },
  { href: '/settings/health-profile', label: 'Health profile', icon: '🫀' },
  { href: '/settings/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/settings/about', label: 'About', icon: 'ⓘ' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname?.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={`${styles.item} ${active ? styles.itemActive : ''}`}>
              <span className={styles.icon}>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}