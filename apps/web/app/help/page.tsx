/**
 * Help page — what Aira can and can't do. 4 sections: in-scope, out-of-scope,
 * how Aira answers (with example chat), privacy. This is the refusal
 * destination for Aira chat refusals.
 */

import styles from './page.module.css';
import Link from 'next/link';

const IN_SCOPE = [
  { title: 'Live AQI for your area', body: 'Current air quality, the 6 pollutant readings (PM2.5, PM10, NO2, SO2, CO, O3), and which bucket the AQI falls into.', ask: "What's the AQI in Bandra right now?" },
  { title: '7-day forecast for your place', body: 'Linear regression on the last 30 days, with a confidence band. Predictions for the next 7 days at the same place. Not longer than 7 days — the model is calibrated for that window only.', ask: 'When will Borivali be cleanest this week?' },
  { title: 'Health advice for your profile', body: 'Tailored to your selected health profile: Healthy adult, Child, Elderly, or Asthmatic. Aira translates AQI numbers into what they mean for you, not what they mean on average.', ask: 'Is it safe for my son to play cricket tomorrow?' },
  { title: 'Station comparison and method', body: 'Which station near you is cleanest right now, why AQI is the way it is, and how the National AQI formula and the forecast model work. All grounded in the data or the methodology page.', ask: 'Is Bandra worse than Borivali today? Why?' },
];

const OUT_OF_SCOPE = [
  { topic: 'General knowledge', redirect: 'History, science unrelated to AQI, geography, math, coding help. Aira will not answer these. Try a general-purpose assistant for that.' },
  { topic: 'Medical diagnosis', redirect: 'Aira translates AQI into general health implications. It does not diagnose, prescribe, or replace a doctor. For personal medical advice, consult a qualified professional.' },
  { topic: 'Forecasts beyond 7 days', redirect: 'The model is calibrated for 7 days. Aira will refuse to predict beyond that. For long-range weather context, try a weather service.' },
  { topic: 'Indoor air quality', redirect: 'Aira reports outdoor AQI from CPCB monitoring stations. It does not have indoor sensor data. For indoor air, you need a separate indoor monitor.' },
  { topic: 'Other states or countries', redirect: 'v1 only ships with Maharashtra data. Aira will say so and stop. Other states are coming in a later release.' },
  { topic: 'Real-time events', redirect: 'Aira reads the live feed but does not have news, social, or fire data. For incident context, see local news.' },
];

export default function HelpPage() {
  return (
    <>
            <main className={styles.main}>
        <div className={styles.crumb}>
          <Link href="/">Home</Link> / <span className={styles.current}>Help</span>
        </div>
        <div className={styles.eyebrow}>HELP CENTER</div>
        <h1 className={styles.h1}>Ask Aira anything about the air around you.</h1>
        <p className={styles.lede}>
          Aira is the air quality assistant for Aira AI. This page tells you what Aira can help with, what it can't, and how it uses your data. Read this once and you'll know exactly what to expect.
        </p>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>IN SCOPE</div>
          <h2 className={styles.h2}>What Aira is great for</h2>
          <p className={styles.sectionSub}>
            Aira is grounded in live air quality data, the National AQI formula, your selected profile, and your recent advisory history. When you ask something in these areas, Aira gives a tailored, cited answer.
          </p>
          <div className={styles.scopeGrid}>
            {IN_SCOPE.map((s, i) => (
              <div key={i} className={styles.scopeCard}>
                <div className={styles.scopeIcon}><span>{['📍', '📈', '👤', '🗺'][i]}</span></div>
                <div className={styles.scopeTitle}>{s.title}</div>
                <div className={styles.scopeBody}>{s.body}</div>
                <div className={styles.scopeAsk}><strong>Try asking:</strong> "{s.ask}"</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>OUT OF SCOPE</div>
          <h2 className={styles.h2}>What Aira can't help with</h2>
          <p className={styles.sectionSub}>
            Aira is a narrow assistant. It will decline questions outside its scope and suggest where to find an answer instead. Decline messages are short, never moralize, and always offer a redirect.
          </p>
          <div className={styles.oosList}>
            {OUT_OF_SCOPE.map((o, i) => (
              <div key={i} className={styles.oosRow}>
                <div className={styles.oosTopic}>{o.topic}</div>
                <div className={styles.oosRedirect}>{o.redirect}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>HOW AIRA ANSWERS</div>
          <h2 className={styles.h2}>Citations, your profile, and frozen context</h2>
          <p className={styles.sectionSub}>
            Every Aira reply cites the data behind it. Aira's behavior is shaped by three things: the data it has access to, the profile you selected, and the area the chat was opened in.
          </p>
          <div className={styles.howGrid}>
            <div className={styles.howList}>
              <h3>What Aira does on every reply</h3>
              <ul>
                <li><span className={styles.check}>✓</span> Cites every factual claim with a small chip pointing to the source: live reading, 7-day forecast, or methodology</li>
                <li><span className={styles.check}>✓</span> Tailors to your health profile (child, asthmatic, elderly, healthy adult). Switch profiles in Settings → Health profile.</li>
                <li><span className={styles.check}>✓</span> Uses frozen context per chat — each chat remembers the location and profile you had when you opened it. Open an old chat and Aira still answers in that context.</li>
                <li><span className={styles.check}>✓</span> Refreshes live data per turn — AQI and forecast numbers are re-fetched every message so they stay current</li>
                <li><span className={styles.check}>✓</span> Decay: refuses out-of-scope questions in one sentence and offers a redirect — never preaches, never moralizes</li>
              </ul>
            </div>
            <div className={styles.howExample}>
              <h3>Example reply with citations</h3>
              <div className={styles.msgUser}>Is it safe for my son to play cricket this Saturday morning in Borivali?</div>
              <div className={styles.msgAssistant}>
                Yes, Saturday morning is a good window. Borivali's AQI is forecast at 135 (Moderate) at 8am, peaking to 158 by afternoon <span className={styles.cite}>[source: 7-day forecast, today]</span>. PM2.5 will be the limiting pollutant, around 58 ug/m3 <span className={styles.cite}>[source: stored readings, today]</span>. For an 8-year-old with mild asthma, an hour of outdoor play between 7-10am is safe. Avoid the 2-5pm peak <span className={styles.cite}>[source: 7-day forecast, today]</span>.
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" className={styles.section}>
          <div className={styles.privacy}>
            <div className={styles.sectionEyebrow}>PRIVACY</div>
            <h2 className={styles.h2}>What Aira sees and what it stores</h2>
            <p className={styles.sectionSub}>
              Aira runs on our servers using a third-party language model (Groq). Your messages and the chat's frozen context are sent to the model provider to generate a reply. We store every chat session in your account, encrypted at rest. We do not use your chats to train any model.
            </p>
            <ul className={styles.privacyList}>
              <li><span className={styles.check}>✓</span> <strong>Data Aira sees per message:</strong> your selected location, your health profile, the last 5 advisories you opened, the relevant AQI/forecast/methodology data for your question.</li>
              <li><span className={styles.check}>✓</span> <strong>Data Aira does NOT see:</strong> your email, your password, your billing info (v1 has no billing), or anything from outside the Aira AI app.</li>
              <li><span className={styles.check}>✓</span> <strong>Delete your data:</strong> Settings → Account → Delete account removes your user row, all chat sessions, all advisory history, and your avatar from storage. Hard delete, no recovery.</li>
              <li><span className={styles.check}>✓</span> <strong>Daily limit:</strong> 50 messages per user per day. After that, Aira will tell you to come back tomorrow. v1 cap; relaxed in v2.</li>
            </ul>
          </div>
        </section>

        <div className={styles.cta}>
          <div>
            <h3>Ready to chat with Aira?</h3>
            <p>Sign in to start a conversation. Your chats are saved to your account, scoped to the location and profile you had when you opened each one.</p>
          </div>
          <div className={styles.ctaBtns}>
            <Link href="/signin" className={styles.ctaPrimary}>Sign in to chat</Link>
            <Link href="/methodology" className={styles.ctaSecondary}>Read the methodology</Link>
          </div>
        </div>

        <div className={styles.foot}>
          <span>v1.0 · Maharashtra · Built by Harish</span>
          <span><Link href="/methodology">Methodology</Link> · <a href="#privacy">Privacy</a> · <a href="mailto:harishp0132@gmail.com">Contact</a> · <a href="https://github.com/Harishisonline/Aira-ai" target="_blank" rel="noreferrer">GitHub</a></span>
        </div>
      </main></>
  );
}

