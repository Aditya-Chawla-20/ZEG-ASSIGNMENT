"""Ingest real Brazos County parcel and wetlands data.

Sources:
- Parcels: Brazos Central Appraisal District (BCAD) 2025 Certified Shapefiles
  URL: https://brazoscad.org/wp-content/uploads/2026/05/BrazosCADParcels_20260422.zip
  Placed in: /app/data/parcels/20260422/Parcels_20260422.shp

- Wetlands: USFWS National Wetlands Inventory (NWI) live REST API
  URL: https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query

Usage:
    python scripts/ingest_real_data.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from shapely.geometry import shape, MultiPolygon
from shapely.ops import transform
from pyproj import Transformer

from app.core.config import get_settings
from app.db.models.parcel import Parcel
from app.db.models.dataset_metadata import DatasetMetadata
from app.db.models.constraint_feature import ConstraintFeature

settings = get_settings()

_utm_to_wgs84 = Transformer.from_crs("EPSG:32614", "EPSG:4326", always_xy=True)
_wgs84_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True)


def reproject(geom, transformer):
    return transform(transformer.transform, geom)


# ---- Shapefile reader --------------------------------------------------------

def read_shapefile_features(shp_path: str) -> list[dict]:
    """Convert .shp to GeoJSON (EPSG:32614) using ogr2ogr, return feature list."""
    result = subprocess.run(
        ["ogr2ogr", "-f", "GeoJSON", "/vsistdout/", "-t_srs", "EPSG:32614", shp_path],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ogr2ogr failed: {result.stderr[:500]}")
    fc = json.loads(result.stdout)
    return fc.get("features", [])


# ---- Wetlands API fetcher ----------------------------------------------------

WETLANDS_URL = (
    "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice"
    "/rest/services/Wetlands/MapServer/0/query"
)
BRAZOS_BBOX_WGS84 = (-96.82, 30.40, -96.00, 30.90)


def fetch_wetlands_geojson(xmin, ymin, xmax, ymax, max_features=1000) -> list[dict]:
    import ssl
    ctx = ssl._create_unverified_context()
    params = urllib.parse.urlencode({
        "where": "1=1",
        "geometry": f"{xmin},{ymin},{xmax},{ymax}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "outSR": "4326",
        "resultRecordCount": max_features,
        "f": "geojson",
    })
    url = f"{WETLANDS_URL}?{params}"
    print(f"  GET ...{url[-80:]}")
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=60)
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("features", [])
    except Exception as e:
        print(f"  WARNING: fetch failed: {e}")
        return []


# ---- DB helpers --------------------------------------------------------------

def get_or_create_dataset(session, name, provider, source_url, notes) -> DatasetMetadata:
    ds = session.query(DatasetMetadata).filter_by(name=name).first()
    if ds is None:
        ds = DatasetMetadata(
            id=uuid.uuid4(),
            name=name,
            provider=provider,
            source_url=source_url,
            licence="Public domain",
            retrieved_at=datetime.now(UTC),
            analysis_crs="EPSG:32614",
            notes=notes,
            created_at=datetime.now(UTC),
        )
        session.add(ds)
        session.flush()
    return ds


# ---- Parcel ingestion --------------------------------------------------------

def ingest_parcels(session: Session) -> int:
    shp_path = "/app/data/parcels/20260422/Parcels_20260422.shp"
    print(f"\n=== Ingesting BCAD parcels from {shp_path} ===")
    deleted = session.query(Parcel).delete()
    session.flush()
    print(f"  Cleared {deleted} existing parcels.")

    print("  Converting shapefile via ogr2ogr → EPSG:32614 GeoJSON ...")
    features = read_shapefile_features(shp_path)
    print(f"  Read {len(features):,} features.")

    inserted = skipped = 0
    seen_source_ids: set[str] = set()
    for feat in features:
        props = feat.get("properties") or {}
        geom_dict = feat.get("geometry")
        if not geom_dict:
            skipped += 1
            continue
        try:
            geom_utm = shape(geom_dict)
        except Exception:
            skipped += 1
            continue
        if not geom_utm or geom_utm.is_empty:
            skipped += 1
            continue
        if geom_utm.geom_type == "Polygon":
            geom_utm = MultiPolygon([geom_utm])

        geom_wgs84 = reproject(geom_utm, _utm_to_wgs84)
        if geom_wgs84.geom_type == "Polygon":
            geom_wgs84 = MultiPolygon([geom_wgs84])
        centroid = geom_wgs84.centroid

        prop_id = props.get("PROP_ID") or props.get("prop_id")
        source_id = f"BCAD-{prop_id}" if prop_id else str(uuid.uuid4())
        if source_id in seen_source_ids:
            skipped += 1
            continue
        seen_source_ids.add(source_id)

        parts = [props.get("situs_num",""), props.get("situs_stre",""),
                 props.get("situs_st_1",""), props.get("situs_st_2","")]
        addr = " ".join(p for p in parts if p).strip()
        city = props.get("addr_city","") or ""
        if city:
            addr = f"{addr}, {city}, TX" if addr else f"{city}, TX"

        legal = props.get("legal_desc","") or ""
        display_name = legal[:100] if legal else f"Parcel {source_id}"

        session.add(Parcel(
            id=uuid.uuid4(),
            source_id=source_id,
            county_name="Brazos",
            display_name=display_name,
            address=addr or None,
            source_area_acres=float(props.get("land_acres") or 0) or None,
            geometry=f"SRID=32614;{geom_utm.wkt}",
            geometry_wgs84=f"SRID=4326;{geom_wgs84.wkt}",
            centroid_wgs84=f"SRID=4326;{centroid.wkt}",
            properties={
                "prop_id": str(prop_id) if prop_id else None,
                "legal_desc": legal,
                "state_cd": props.get("state_cd"),
                "market_value": props.get("market"),
                "land_value": props.get("Land_Val"),
                "yr_built": props.get("yr_blt"),
                "class_cd": props.get("class_cd"),
                "entities": props.get("Entities"),
                "source": "BCAD_2025_certified",
            },
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ))
        inserted += 1
        if inserted % 5000 == 0:
            session.flush()
            print(f"  ... {inserted:,} parcels flushed")

    session.flush()
    print(f"  Done: {inserted:,} parcels inserted, {skipped} skipped.")
    return inserted


# ---- Wetlands ingestion ------------------------------------------------------

def ingest_wetlands(session: Session) -> int:
    print("\n=== Ingesting USFWS NWI wetlands via live REST API ===")
    deleted = session.query(ConstraintFeature).filter_by(layer_type="wetlands").delete()
    session.flush()
    print(f"  Cleared {deleted} existing wetland features.")

    ds = get_or_create_dataset(
        session,
        name="USFWS National Wetlands Inventory",
        provider="U.S. Fish & Wildlife Service",
        source_url=(
            "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice"
            "/rest/services/Wetlands/MapServer/0"
        ),
        notes=(
            "NWI wetland polygons for Brazos County, TX. "
            "Fetched live from the USFWS ArcGIS REST MapServer."
        ),
    )

    xmin, ymin, xmax, ymax = BRAZOS_BBOX_WGS84
    cols, rows = 4, 4
    dx, dy = (xmax - xmin) / cols, (ymax - ymin) / rows
    tiles = [
        (xmin + i * dx, ymin + j * dy, xmin + (i+1)*dx, ymin + (j+1)*dy)
        for j in range(rows) for i in range(cols)
    ]

    inserted = 0
    seen: set = set()
    for tile in tiles:
        features = fetch_wetlands_geojson(*tile)
        print(f"  Tile ({round(tile[0],2)},{round(tile[1],2)})-({round(tile[2],2)},{round(tile[3],2)}): {len(features)} features")
        for feat in features:
            props = feat.get("properties") or {}
            obj_id = props.get("OBJECTID")
            if obj_id is not None:
                if obj_id in seen:
                    continue
                seen.add(obj_id)
            geom_dict = feat.get("geometry")
            if not geom_dict:
                continue
            try:
                geom_wgs84 = shape(geom_dict)
            except Exception:
                continue
            if not geom_wgs84 or geom_wgs84.is_empty:
                continue
            geom_utm = reproject(geom_wgs84, _wgs84_to_utm)
            wetland_type = props.get("WETLAND_TYPE") or ""
            session.add(ConstraintFeature(
                id=uuid.uuid4(),
                dataset_id=ds.id,
                layer_type="wetlands",
                classification=wetland_type[:50] if wetland_type else None,
                geometry=f"SRID=32614;{geom_utm.wkt}",
                properties={
                    "WETLAND_TYPE": wetland_type,
                    "ATTRIBUTE": props.get("ATTRIBUTE"),
                    "GLOBALID": props.get("GLOBALID"),
                    "ACRES": props.get("ACRES"),
                    "source": "USFWS_NWI_live",
                },
                created_at=datetime.now(UTC),
            ))
            inserted += 1
        if inserted % 200 == 0 and inserted > 0:
            session.flush()

    session.flush()
    print(f"  Done: {inserted} wetland features inserted.")
    return inserted


# ---- Main --------------------------------------------------------------------

def main():
    print("=== LandScope Real Data Ingestion ===")
    engine = create_engine(settings.DATABASE_URL)
    with Session(engine) as session:
        with session.begin():
            n_parcels = ingest_parcels(session)
            n_wetlands = ingest_wetlands(session)
    print(f"\n=== Complete ===")
    print(f"  Parcels:  {n_parcels:,}")
    print(f"  Wetlands: {n_wetlands:,}")


if __name__ == "__main__":
    main()
