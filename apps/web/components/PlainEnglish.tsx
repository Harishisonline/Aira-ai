/**
 * PlainEnglish — the callout below the forecast chart. Server-rendered
 * text from Groq (the worker calls Groq during the /advisories/refresh
 * route and caches the result per (place, profile, hour); this component
 * just displays the result).
 */

import styles from './PlainEnglish.module.css';

interface Props {
  text: string;
}

export function PlainEnglish({ text }: Props) {
  if (!text) return null;
  return (
    <div className={styles.callout}>
      <div className={styles.eyebrow}>Plain English</div>
      <p className={styles.text}>{text}</p>
    </div>
  );
}
