/**
 * Methodology — how Aira computes NAQI, the 7-day forecast, and advisories.
 */

import styles from './page.module.css';
import Link from 'next/link';

const BUCKETS = [
  { name: 'Good', range: '0 – 50', note: 'Minimal impact', color: 'var(--good)' },
  { name: 'Satisfactory', range: '51 – 100', note: 'Minor breathing discomfort for very sensitive people', color: 'var(--sat)' },
  { name: 'Moderate', range: '101 – 200', note: 'Breathing discomfort for people with lung or heart disease', color: 'var(--mod)' },
  { name: 'Poor', range: '201 – 300', note: 'Breathing discomfort for most people on prolonged exposure', color: 'var(--poor)' },
  { name: 'Very Poor', range: '301 – 400', note: 'Respiratory illness on prolonged exposure', color: 'var(--vpoor)' },
  { name: 'Severe', range: '401 – 500', note: 'Affects healthy people, serious impact on those with existing diseases', color: 'var(--severe)' },
];

export default function MethodologyPage() {
  return (
    <main className={styles.main}>
      <article className={styles.article} id="methodology">
        <header className={styles.header}>
          <div className={styles.eyebrow}>Methodology</div>
          <h1 className={styles.h1}>How Aira AI computes AQI and forecasts it</h1>
          <p className={styles.lede}>
            A transparent breakdown of the data sources, math, and assumptions. v1 model. Last reviewed 14 Jan 2026.
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 1</div>
          <h2>Data source: Central Pollution Control Board</h2>
          <p>
            Every reading on Aira AI is a National AQI value for a CPCB monitoring station. The network has 28 active stations across Maharashtra. Live numbers are pulled through the OpenAQ aggregator, which mirrors Indian government stations including the CPCB CCR feed, and fall back to a deterministic mock fetcher if that feed is unreachable. Aira AI does not modify raw measurements. The worker re-fetches every 15 minutes. A reading older than 2 hours is flagged stale.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 2</div>
          <h2>AQI: the Indian National AQI formula</h2>
          <p>
            We use the official NAQI computation, not the US EPA formula. Each pollutant gets a sub-index by piecewise-linear interpolation across six concentration buckets. The reported AQI is the maximum of the available sub-indices. The dominant pollutant is whichever sub-index equals that maximum.
          </p>
          <div className={styles.formula}>
            <div className={styles.formulaLabel}>Sub-index</div>
            I = ((I_hi - I_lo) / (BP_hi - BP_lo)) * (C - BP_lo) + I_lo
          </div>
          <div className={styles.formula}>
            <div className={styles.formulaLabel}>AQI computation</div>
            AQI = max(I_PM2.5, I_PM10, I_NO2, I_SO2, I_CO, I_O3)
          </div>
          <table className={styles.buckets}>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>AQI range</th>
                <th>Health implication</th>
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map((b) => (
                <tr key={b.name}>
                  <td><span className={styles.bucketDot} style={{ background: b.color }} />{b.name}</td>
                  <td>{b.range}</td>
                  <td>{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            PM2.5 breakpoints (µg/m³ → AQI) are 0–30 → 0–50, 31–60 → 51–100, 61–90 → 101–200, 91–120 → 201–300, 121–250 → 301–400, 251–380 → 401–500. Breakpoints for PM10, NO2, SO2, CO, and O3 differ.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 3</div>
          <h2>Forecast: linear regression on 30-day history</h2>
          <p>
            For each station we fit ordinary least squares of daily AQI against day index over the trailing 30 days. The prediction for day d is y(d) = a + b·d. The 7-day forecast is y at today+1 through today+7. The confidence band is ± one standard error of the residuals. Model version: v1-linreg-30d. R² is shown on the forecast chart so a weak fit stays visible.
          </p>
          <div className={styles.codeWrap}>
            <div className={styles.codeEyebrow}>Pseudocode</div>
            <pre className={styles.code}>{`# for each station s:
history = last_30_days_of_daily_mean_aqi(s)
X = [0, 1, 2, ..., 29]
a, b = linear_regression(X, history)
for d in range(1, 8):
    predicted[d] = a + b * (29 + d)
    stderr = residual_std_error(X, history, a, b)
    ci[d] = (predicted[d] - stderr, predicted[d] + stderr)`}</pre>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 4</div>
          <h2>Why linear regression</h2>
          <p>
            OLS is interpretable, fast, and matches a 30-day daily series for a single station. ARIMA and LSTM are reserved for a later version if the test set shows the linear fit is consistently wrong. A low R² on the forecast page means the prediction should not be treated as precise.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 5</div>
          <h2>AI-generated advisories</h2>
          <p>
            The Plain-English forecast summary and personalised advisories are generated by a language model on Groq (qwen/qwen3-32b, with openai/gpt-oss-120b as fallback). The model receives the current AQI, the 7-day forecast, and the selected profile: healthy adult, child, elderly, or asthmatic. Every chat reply is meant to cite its source. Aira refuses questions outside air quality and points to <Link href="/help">Help</Link>. Advisories are a starting point, not a substitute for medical care.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>Section 6</div>
          <h2>Limitations</h2>
          <p>
            v1 does not model indoor air, pollutant-specific clinical risk, street-level differences, or places without a nearby CPCB station. Forecasts stop at 7 days. Station outages are marked stale rather than filled in. Other Indian states are out of scope until a later release.
          </p>
        </section>

        <div className={styles.sources}>
          <div className={styles.sourcesLabel}>References</div>
          <ul>
            <li>CPCB National AQI Computation Method (2014)</li>
            <li>WHO Global Air Quality Guidelines (2021)</li>
            <li>CPCB Continuous Ambient Air Quality Monitoring data, via OpenAQ</li>
            <li>Indian Medical Association — Air Pollution and Public Health (2023)</li>
            <li>Forecast model v1-linreg-30d · database and auth on Supabase</li>
          </ul>
        </div>
      </article>
      <div className={styles.footer}>
        Aira AI · Built for Maharashtra · <a href="#methodology">Back to top</a>
      </div>
    </main>
  );
}
