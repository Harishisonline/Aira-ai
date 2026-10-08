import Link from 'next/link';
import styles from './BrandMark.module.css';

export function BrandMark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={styles.mark}>
      <img src="/aira-icon.png" alt="" className={styles.icon} />
      <span>Aira AI</span>
    </Link>
  );
}
