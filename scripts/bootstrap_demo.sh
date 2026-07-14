#!/usr/bin/env bash
set -euo pipefail

echo "=== LandScope Demo Bootstrap ==="
echo ""
echo "Step 1: Starting services..."
docker compose up --build -d

echo ""
echo "Step 2: Waiting for database to be ready..."
timeout=60
counter=0
while ! docker compose exec db pg_isready -U postgres -d landscope -q 2>/dev/null; do
    if [ $counter -ge $timeout ]; then
        echo "ERROR: Database failed to start within ${timeout}s"
        exit 1
    fi
    sleep 2
    counter=$((counter + 2))
    echo "  Waiting... ($counter/$timeout)s"
done
echo "  Database is ready!"

echo ""
echo "Step 3: Running migrations..."
docker compose exec backend alembic upgrade head

echo ""
echo "Step 4: Loading demo data..."
docker compose exec backend python scripts/ingest_demo_data.py

echo ""
echo "=== Bootstrap Complete ==="
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/api/docs"
echo ""
echo "Demo parcels are loaded and ready to use."
echo "Use the parcel search or click a bookmark to get started."
