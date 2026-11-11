# --- Stage 1: Build Dependencies ---
FROM python:3.11-slim AS builder

WORKDIR /app
ENV PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip wheel --no-deps --wheel-dir /app/wheels -r requirements.txt

# --- Stage 2: Runtime ---
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install runtime PostgreSQL library only (much smaller than libpq-dev)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built Python packages from builder
COPY --from=builder /app/wheels /wheels
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-index --find-links=/wheels -r /app/backend/requirements.txt \
    && rm -rf /wheels

# Install Playwright and clean apt cache in the same layer
RUN mkdir -p /ms-playwright \
    && playwright install --with-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R 755 /ms-playwright

COPY backend /app/backend

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets \
    && chown -R appuser:appuser /app /ms-playwright \
    && chmod 755 /app/backend/uploads \
                /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets

USER appuser
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]