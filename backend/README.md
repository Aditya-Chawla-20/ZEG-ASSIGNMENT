# LandScope Backend

Buildable Land Analysis API — a FastAPI geospatial service that determines
buildable land area for a parcel after applying environmental and infrastructure
constraints (wetlands, FEMA flood hazard, transmission line corridors) and
user-drawn manual exclusions / restorations.

## Quickstart

```bash
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs are available at <http://localhost:8000/api/docs>.

## Stack

- **FastAPI** + **Pydantic v2** for the API layer
- **SQLAlchemy 2.x** + **GeoAlchemy2** for persistence (PostgreSQL + PostGIS)
- **Shapely 2.x** + **pyproj** for geometry operations
- **structlog** for structured JSON logging
- **Alembic** for migrations

## Analysis CRS

All area calculations are performed in a projected CRS — **EPSG:32614**
(UTM Zone 14N), appropriate for Brazos County, Texas — never in EPSG:4326
or EPSG:3857. Geometries are stored in both the analysis CRS and WGS84 for
fast serving to the frontend.
