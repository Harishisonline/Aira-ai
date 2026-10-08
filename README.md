# Aira AI

Know the air your family breathes.

Aira AI is an air-quality app for Maharashtra. It shows the current National AQI for a CPCB station, a 7-day forecast, a health advisory for the profile you pick, and a chat that answers from those stored readings. You can compare two stations in the same state.

The web app is Next.js. The worker is a Python service that ingests readings, runs the forecast, and sends alert email. Accounts, the database, and file storage are Supabase. Chat and the written advisories use Groq. Email uses Resend.

## What you can do

- Browse a station home, city dashboard, 7-day forecast, and station map.
- Read a health advisory for a healthy adult, a child, an elderly person, or someone with asthma.
- Compare two Maharashtra stations side by side.
- Open an advisory chat. Each chat keeps the place and profile it was started with. Aira uses your display name, bio, and details you ask it to remember.
- Change your area, name, photo, health profile, and alert threshold in Settings.

Guests can read public pages. Signing in is required for chat history, saved settings, and email alerts.

## Stack

| Piece | Role |
| --- | --- |
| Next.js 15 (App Router) and React | Web app in `apps/web` |
| Python 3.11+ and FastAPI | Worker in `apps/worker` |
| Supabase | Postgres, Auth, Row Level Security, avatar storage |
| Groq | Chat replies and compare write-ups. Primary model `openai/gpt-oss-20b`, fallback `openai/gpt-oss-120b` |
| Resend | Threshold alerts and scheduled email |
| OpenAQ | Optional live readings. Without a key, the worker uses a deterministic mock |

## Repository layout

```
apps/web/          Next.js app, API routes, and UI
apps/worker/       FastAPI worker, AQI math, forecast, ingest, email
  app/db/migrations/   SQL applied in filename order
  app/db/local_postgres.sql
tests/             Backtests and worker smoke checks
assets/ui-mockups/ Visual references for the screens
prd/PRD.md         Product spec
.env.example       Variable names for local setup
docker-compose.yml Postgres, MailHog, worker, and web
```

## Prerequisites

- Node.js 20 or newer
- npm (the web app ships a `package-lock.json`)
- Python 3.11 or newer
- A Supabase project
- A Groq API key if you want chat and compare write-ups
- A Resend API key if you want email alerts

Open the site at `http://localhost:3000`. Auth cookies are tied to that host, so `http://127.0.0.1:3000` is not the same site.

## Installation

1. Clone the repository and enter it.

```bash
git clone <repository-url>
cd aira-ai
```

2. Create your env file from the example and replace every secret with your own. Do not commit `.env`.

```bash
cp .env.example .env
```

The worker reads the repo-root `.env`. Next.js reads env files inside `apps/web`, so copy the same file there too:

```bash
cp .env apps/web/.env
```

Do not `source .env` in a shell. `RESEND_FROM` may contain spaces.

3. Create a Supabase project and fill these values in both env files:

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API, `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API, `service_role` key. Server only. |
| `DATABASE_URL` | Project Settings → Database → connection string. Use the pooler URI on port 6543 when the direct host is blocked. |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM` | A sender address Resend has verified |
| `OPENAQ_KEY` | Optional. Leave empty to use the mock fetcher. |
| `AQI_FALLBACK_TO_MOCK` | `true` in local development |
| `WEB_URL` | `http://localhost:3000` |
| `WORKER_URL` | `http://localhost:8000` |
| `WORKER_INTERNAL_TOKEN` | Any long random string, shared by web and worker |

In the Supabase dashboard, set Authentication → URL configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

Email and password sign-in works without Google or Apple. Those buttons need the provider enabled in Authentication → Providers, with a client id and secret. More notes are in `SUPABASE_DASHBOARD_SETUP.md`.

4. Apply the database schema. From `apps/worker`, with `DATABASE_URL` pointing at the database you want:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m app.db.migrate
```

That runs `app/db/migrations/*.sql` in order. It creates tables and the owner policies. For a local Postgres started by Docker, the default URL is `postgresql://postgres:postgres@localhost:5432/aira`.

5. Install the web dependencies.

```bash
cd apps/web
npm ci
```

## Run the app

Use two terminals. Start the worker first, then the web app.

### Worker

```bash
cd apps/worker
source .venv/bin/activate
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)

The worker loads the repo-root `.env` on startup. It refreshes readings every 15 minutes, scans alert thresholds every 15 minutes, and sends queued email every 60 seconds. If `OPENAQ_KEY` is empty and `AQI_FALLBACK_TO_MOCK` is true, readings come from the mock fetcher.

### Web, development

```bash
cd apps/web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`NEXT_PUBLIC_*` values are read when the Next.js process starts. Restart `npm run dev` after you change them.

### Web, production build

```bash
cd apps/web
npm run build
PORT=3000 HOSTNAME=127.0.0.1 npm start
```

`npm start` serves `node .next/standalone/server.js`. `NEXT_PUBLIC_*` values are baked in at `npm run build`, so build again after you change them. The build copies `public/` and `.next/static` into the standalone folder.

### Docker Compose

`docker compose up --build` starts Postgres, MailHog (captured mail at [http://localhost:8025](http://localhost:8025)), the worker, and the web app. The web container still needs `NEXT_PUBLIC_SUPABASE_URL` and the Supabase keys in the environment, because accounts go through Supabase Auth rather than the Compose Postgres. MailHog receives worker mail when `SMTP_HOST` is set, which the Compose file does for the worker.

## Sign-in

Create an account on `/signin` with an email and a password of at least 8 characters. Open the confirmation link in the same browser, then sign in with that password. Later visits use the password. A full page load of `http://localhost:3000` is required after sign-in so the session cookie is on the right host.

After the first sign-in you pick a city and a place. You can change that later in Settings → General.

## Main routes

| Path | Page |
| --- | --- |
| `/` | Landing. Signed-in visitors go to their area, or to area setup if they have not picked one. |
| `/signin` | Email and password. Google and Apple when those providers are enabled. |
| `/onboarding/area` | Pick a Maharashtra city and place. |
| `/[state]/[city]/[place]` | Station home |
| `.../dashboard` | City dashboard |
| `.../forecast` | 7-day forecast |
| `.../map` | Station map |
| `.../advisory` | Health advisory |
| `.../advisory/chat` | Aira chat. Requires sign-in. |
| `.../compare` | Compare two stations in Maharashtra |
| `/methodology` | How AQI and the forecast are computed |
| `/help` | What Aira can and cannot answer |
| `/settings/account` | Name, photo, email, sessions |
| `/settings/general` | Theme and default area |
| `/settings/health-profile` | Health profile |
| `/settings/alerts` | Alert threshold and email alerts |
| `/settings/about` | About this project |

## Scripts

From `apps/web`:

```bash
npm run dev          # next dev
npm run build        # production build, then copies static files into standalone
npm start            # node .next/standalone/server.js
npm run lint
npm run typecheck
npm run test:unit
```

From the repo root, with the worker already running:

```bash
python3 tests/backtest_e2e.py
python3 tests/worker_smoke.py
```

## Project spec

`prd/PRD.md` is the product contract: routes, data shapes, and what v1 does not include. `assets/ui-mockups/` is the visual reference for the screens.

## License

Built by Harish. The repository is open so it can be read, forked, and adapted. A separate `LICENSE` file is not in the tree yet.
