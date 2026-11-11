
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

# Build wheels for all direct and transitive dependencies
RUN python -m pip wheel \
    --wheel-dir=/app/wheels \
    -r requirements.txt


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


# =========================================================
# Update OS Packages and Install Runtime Libraries
# =========================================================

# Upgrade existing Debian packages to receive security fixes.
# Install required PostgreSQL and Playwright runtime libraries.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        libatomic1 \
    && zlib_version="$(dpkg-query -W -f='${Version}' zlib1g)" \
    && echo "Installed zlib1g version: ${zlib_version}" \
    && dpkg --compare-versions "$zlib_version" ge \
        "1:1.3.dfsg+really1.3.1-1+deb13u1" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


# =========================================================
# Install Python Dependencies (Offline)
# =========================================================

COPY --from=builder /app/wheels /wheels
COPY backend/requirements.txt /app/backend/requirements.txt

RUN python -m pip install \
    --no-index \
    --find-links=/wheels \
    -r /app/backend/requirements.txt \
    && python -m pip check \
    && python -m pip show playwright \
    && python -m playwright --version \
    && rm -rf /wheels


# =========================================================
# Install Playwright Chromium and OS Dependencies
# =========================================================

RUN mkdir -p /ms-playwright \
    && python -m playwright install-deps chromium \
    && python -m playwright install chromium \
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
