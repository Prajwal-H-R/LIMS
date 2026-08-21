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

# Install browser binaries into a shared path
RUN mkdir -p /ms-playwright \
    && python -m playwright install --with-deps chromium \
    && chmod -R 755 /ms-playwright

COPY backend /app/backend

RUN mkdir -p /app/backend/uploads/inward_photos \
    && chmod -R 755 /app/backend/uploads

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app /ms-playwright

USER appuser

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]