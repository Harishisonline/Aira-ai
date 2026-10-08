/**
 * DestinationCard — the 5 cards on the home page that link to the major
 * sub-pages. Icon, title, subtitle, href.
 */

import Link from 'next/link';
import styles from './DestinationCard.module.css';

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  href: string;
}

export function DestinationCard({ icon, title, subtitle, href }: Props) {
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.icon}>
        <span>{icon}</span>
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.subtitle}>{subtitle}</div>
    </Link>
  );
}
