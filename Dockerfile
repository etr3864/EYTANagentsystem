FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for psycopg2 and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects PORT (often 10000). Bind to it; fall back for local runs.
ENV PORT=8000
EXPOSE 8000

# Docker-level check only — Render uses its own /health against $PORT.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health')" || exit 1

# Prefer Render's WEB_CONCURRENCY (1 on small instances). Hardcoding 4 workers
# on a 1-CPU box can delay/fail bind during deploy health checks.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --log-level warning"]
