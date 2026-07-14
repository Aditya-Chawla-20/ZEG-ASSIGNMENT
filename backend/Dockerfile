FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching
COPY pyproject.toml .
COPY README.md .
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/

RUN pip install --no-cache-dir -e .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
