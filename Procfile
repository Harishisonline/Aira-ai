web: cd apps/web && pnpm install --frozen-lockfile && pnpm build && pnpm start
worker: cd apps/worker && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
# Note: `pnpm start` in apps/web now invokes `node .next/standalone/server.js`
# because next.config.js sets `output: 'standalone'` for small Docker images.
# If you need the non-standalone dev server, run `pnpm start:compat` instead.
