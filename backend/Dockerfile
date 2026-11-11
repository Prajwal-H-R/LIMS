
# =========================================================
# Stage 1: Build Python Dependencies
# =========================================================
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build-time dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest
COPY backend/requirements.txt ./requirements.txt

# Build wheels for ALL direct and transitive dependencies
# IMPORTANT: Do not use --no-deps
RUN pip wheel --wheel-dir=/app/wheels -r requirements.txt


# =========================================================
# Stage 2: Production Runtime
# =========================================================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install PostgreSQL runtime library only
# libpq-dev and build-essential remain in the builder stage
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*


# =========================================================
# Install Python Dependencies (Offline)
# =========================================================

# Copy pre-built wheels from builder
COPY --from=builder /app/wheels /wheels
COPY backend/requirements.txt /app/backend/requirements.txt

# Install all dependencies without accessing PyPI
RUN pip install --no-index --find-links=/wheels \
    -r /app/backend/requirements.txt \
    && rm -rf /wheels


# =========================================================
# Install Playwright Chromium
# =========================================================

# Install Chromium and its required system dependencies
RUN mkdir -p /ms-playwright \
    && playwright install --with-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


# =========================================================
# Copy Backend Application
# =========================================================

COPY backend /app/backend


# =========================================================
# Create Non-Root Application User
# =========================================================

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets \
    && chown -R appuser:appuser /app /ms-playwright \
    && chmod 755 /app/backend/uploads \
                /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets


# =========================================================
# Production Configuration
# =========================================================

USER appuser

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
