"""Live USFWS National Wetlands Inventory fetcher.

Fetches wetland polygons from the public USFWS ArcGIS REST MapServer for a
given WGS84 bounding box.  Used as a live data source when the database has no
wetland features for a parcel (e.g. during development or if the ingestion
script has not yet been run).
"""
from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
from typing import TYPE_CHECKING

from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Transformer

from app.core.logging import get_logger

if TYPE_CHECKING:
    from shapely.geometry.base import BaseGeometry

logger = get_logger(__name__)

WETLANDS_REST_URL = (
    "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice"
    "/rest/services/Wetlands/MapServer/0/query"
)

_WGS84_TO_UTM14 = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True)


def _fetch_features_json(bbox_wgs84: tuple[float, float, float, float]) -> list[dict]:
    """Fetch GeoJSON features from the USFWS NWI REST endpoint."""
    xmin, ymin, xmax, ymax = bbox_wgs84
    params = urllib.parse.urlencode(
        {
            "where": "1=1",
            "geometry": f"{xmin},{ymin},{xmax},{ymax}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "WETLAND_TYPE,ATTRIBUTE,GLOBALID,ACRES",
            "outSR": "4326",
            "resultRecordCount": 2000,
            "f": "geojson",
        }
    )
    url = f"{WETLANDS_REST_URL}?{params}"
    ctx = ssl._create_unverified_context()
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=30)
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("features", [])
    except Exception as exc:
        logger.warning("wetlands_fetch_failed", url=url[:80], error=str(exc))
        return []


def fetch_wetland_geoms_for_parcel(
    parcel_geom_wgs84: "BaseGeometry",
) -> list[tuple["BaseGeometry", str | None]]:
    """Fetch wetland geometries (EPSG:32614) that intersect the parcel.

    Returns a list of (geometry, wetland_type) tuples in the analysis CRS
    (EPSG:32614).  Returns an empty list on any network failure.

    Args:
        parcel_geom_wgs84: Parcel polygon in WGS84 (EPSG:4326).

    Returns:
        List of (geom_in_utm14n, wetland_type_str) pairs.
    """
    bounds = parcel_geom_wgs84.bounds  # (minx, miny, maxx, maxy) in WGS84
    # Add a small buffer to the bbox (0.01° ≈ 1 km)
    pad = 0.01
    bbox = (bounds[0] - pad, bounds[1] - pad, bounds[2] + pad, bounds[3] + pad)

    features = _fetch_features_json(bbox)
    logger.info("wetlands_live_fetched", count=len(features), bbox=bbox)

    results: list[tuple[BaseGeometry, str | None]] = []
    for feat in features:
        geom_dict = feat.get("geometry")
        if not geom_dict:
            continue
        try:
            geom_wgs84 = shape(geom_dict)
        except Exception:
            continue
        if not geom_wgs84 or geom_wgs84.is_empty:
            continue
        # Quick intersection check in WGS84 to reduce noise
        if not geom_wgs84.intersects(parcel_geom_wgs84):
            continue
        # Reproject to analysis CRS (EPSG:32614)
        geom_utm = transform(_WGS84_TO_UTM14.transform, geom_wgs84)
        props = feat.get("properties") or {}
        wetland_type = props.get("WETLAND_TYPE") or None
        results.append((geom_utm, wetland_type))

    return results
