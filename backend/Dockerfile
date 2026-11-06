FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt

RUN python -m pip install --upgrade "pip" "setuptools==78.1.1" "wheel" \
    && pip install --no-cache-dir -r /app/backend/requirements.txt

# Install browser binaries into a shared path.
RUN mkdir -p /ms-playwright \
    && python -m playwright install --with-deps chromium \
    && chmod -R 755 /ms-playwright

# Copy application source code.
# Runtime upload directories are persisted through Docker Compose
# bind mounts and are stored outside the project directory on the host.
COPY backend /app/backend

# Create the expected storage directories inside the image.
# These are mount points only; actual files will be stored on the host.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets \
    && chown -R appuser:appuser /app /ms-playwright \
    && chmod 755 /app/backend/uploads \
                /app/backend/uploads/inward_photos \
                /app/backend/certificate_assets

# Run the application as a non-root user.
USER appuser

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]