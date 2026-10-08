# Local development environment for the worker.
# The web app uses its own .env.local at apps/web/.env.local.

FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg + Pillow. libpq5 is the runtime; libpq-dev + gcc are build-time only.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libpq5 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash --uid 1000 aira

# Install deps first for layer caching
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Copy source
COPY --chown=aira:aira app ./app

# Make app importable as a package
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

USER aira
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# Default command (overridden by docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
