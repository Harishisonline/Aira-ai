/**
 * Chat-locked — mockup 15. Own split shell (no app Nav).
 */

import Link from 'next/link';
import { BrandMark } from '../../../components/BrandMark';
import styles from './page.module.css';

export default function ChatLockedPage() {
  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <div className={styles.brand}><BrandMark /></div>
        <h1 className={styles.hero}>Ask Aira anything about the air around you.</h1>
        <p className={styles.heroSub}>
          Your chat history is saved to your account so you can come back to it. Each chat remembers the location and profile you had when you started it.
        </p>
        <ul className={styles.benefits}>
          <li>Answers grounded in live AQI, forecast, and your health profile</li>
          <li>Citations back to the tools Aira used</li>
          <li>Schedule email alerts from chat (2/day cap)</li>
        </ul>
        <div className={styles.stats}>
          <div>
            <div className={styles.statVal}>28</div>
            <div className={styles.statLbl}>live stations</div>
          </div>
          <div>
            <div className={styles.statVal}>7d</div>
            <div className={styles.statLbl}>forecast</div>
          </div>
          <div>
            <div className={styles.statVal}>4</div>
            <div className={styles.statLbl}>profiles</div>
          </div>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.card}>
          <div className={styles.lockIcon} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Chat with Aira is temporarily offline</h2>
          <p className={styles.cardSub}>
            The advisor service is being updated. Try again in a few minutes.
          </p>
          <div className={styles.ctas}>
            <Link href="/signin?next=/maharashtra/mumbai/borivali/advisory/chat" className={styles.btnPrimary}>
              Sign in
            </Link>
            <Link href="/maharashtra/mumbai/borivali/advisory" className={styles.btnLink}>
              ← Back to advisory
            </Link>
            <Link href="/help" className={styles.btnLink}>
              Read what Aira can help with
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
