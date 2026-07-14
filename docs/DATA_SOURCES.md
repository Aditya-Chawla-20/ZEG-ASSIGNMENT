# LandScope: Data Sources

This document describes each dataset used by LandScope, including the
provider, source URL, format, fields used, default buffers, and licence.

> **Important:** The demo data loaded by `scripts/ingest_demo_data.py` is
> **synthetic**. It is clearly labeled as `SYNTHETIC DEMO DATA` in all
> metadata records. It does NOT represent authoritative wetland,
> floodplain, or transmission line information. To use real data, follow
> the import instructions below for each dataset.

---

## 1. Texas Parcels — Brazos County

| Field | Value |
|---|---|
| **Provider** | Texas Geographic Information Office (TxGIO) / Texas Natural Resources Information System (TNRIS) |
| **Source URL** | https://data.tnris.org/collection/64571f04-4e04-4393-b2d9-b53aa89f2e17 |
| **Format** | Shapefile / GeoJSON |
| **Fields used** | Parcel ID, address, geometry |
| **Default buffer** | N/A (parcels are the analysis target, not a constraint) |
| **Demo status** | SYNTHETIC demo data used; see `scripts/ingest_demo_data.py` for real data import |
| **Licence** | Public domain / open government data |

### Notes

- TxGIO (formerly TNRIS) is the primary source for Texas statewide GIS
  data, including parcel boundaries.
- The parcel layer provides the base geometry for analysis. Each parcel
  is stored in both the analysis CRS (EPSG:32614) and WGS84 (EPSG:4326).
- Owner names are intentionally NOT stored or returned by the API.

### Importing real data

1. Download the Brazos County parcel shapefile from the TxGIO portal.
2. Reproject to EPSG:32614 using `ogr2ogr`:
   ```bash
   ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=landscope user=postgres" \
     -t_srs EPSG:32614 -s_srs EPSG:4326 \
     brazos_parcels.shp
   ```
3. Map the source fields to the `parcels` table schema:
   `source_id`, `county_name`, `display_name`, `address`, `geometry`.
4. Compute `geometry_wgs84` and `centroid_wgs84` using `ST_Transform`:
   ```sql
   UPDATE parcels SET
     geometry_wgs84 = ST_Transform(geometry, 4326),
     centroid_wgs84 = ST_Centroid(ST_Transform(geometry, 4326));
   ```

---

## 2. USFWS National Wetlands Inventory (NWI)

| Field | Value |
|---|---|
| **Provider** | U.S. Fish & Wildlife Service (USFWS) |
| **Source URL** | https://www.fws.gov/program/national-wetlands-inventory/wetlands-data |
| **Format** | Shapefile / GeoPackage |
| **Fields used** | `WETLAND_TYPE`, `ATTRIBUTE`, geometry |
| **Default buffer** | 30 metres (planning assumption, **not** a legal setback) |
| **Demo status** | SYNTHETIC demo data used |
| **Licence** | Public domain (U.S. Federal Government) |

### Notes

- The NWI is the authoritative source for wetland locations in the
  United States, maintained by USFWS.
- The `ATTRIBUTE` field encodes wetland classification (e.g., `PUBHh` =
  Palustrine Unconsolidated Bottom Permanent Semi-permanently Flooded
  Diked/Impounded).
- The 30 m default buffer is a **planning assumption** for screening. Real
  wetland setbacks vary by state and wetland type. Users can adjust the
  buffer per analysis request.

### Importing real data

1. Download the NWI data for your region from the USFWS wetlands data
   page (available by HUC or state).
2. Reproject to EPSG:32614:
   ```bash
   ogr2ogr -f "PostgreSQL" PG:"host=localhost dbname=landscope user=postgres" \
     -t_srs EPSG:32614 -s_srs EPSG:4326 \
     wetlands.shp
   ```
3. Insert into `constraint_features` with `layer_type = 'wetlands'` and
   `classification` set from the `ATTRIBUTE` field.

### Wetland classification reference

| Code prefix | Type |
|---|---|
| `L` | Lacustrine (lake) |
| `P` | Palustrine (freshwater marsh, swamp, pond) |
| `R` | Riverine (river/stream) |
| `M` | Marine (saltwater) |
| `E` | Estuarine (brackish tidal) |

---

## 3. FEMA National Flood Hazard Layer (NFHL)

| Field | Value |
|---|---|
| **Provider** | Federal Emergency Management Agency (FEMA) |
| **Source URL** | https://msc.fema.gov/portal/advanceSearch |
| **Format** | Shapefile / GeoPackage |
| **Fields used** | `FLD_ZONE` (A, AE, AH, AO, VE, X), geometry |
| **Default buffer** | 0 metres (flood zones are already regulatory boundaries) |
| **Demo status** | SYNTHETIC demo data used |
| **Licence** | Public domain (U.S. Federal Government) |

### Notes

- The NFHL is FEMA's digital flood hazard layer. It shows Special Flood
  Hazard Areas (SFHAs) and non-SFHA zones.
- LandScope uses the `FLD_ZONE` field to filter which zones to include.
  By default, all flood zones are included. Users can restrict to
  specific zones (e.g., only `AE` and `VE`).
- No buffer is applied by default because flood zone boundaries are
  already the regulatory limits. A buffer could be added for conservative
  screening if desired.

### Flood zone classifications

| Zone | Description |
|---|---|
| `A` | 1% annual chance flood (no base flood elevations determined) |
| `AE` | 1% annual chance flood (base flood elevations determined) |
| `AH` | 1% annual chance shallow flooding (usually ponding) |
| `AO` | 1% annual chance shallow flooding (sheet flow) |
| `VE` | 1% annual chance flood with velocity hazard (coastal) |
| `X` | 0.2% annual chance flood or 1% future conditions |

### Importing real data

1. Download the NFHL for your county from the FEMA Map Service Center.
2. Reproject to EPSG:32614 and load into `constraint_features` with
   `layer_type = 'floodplain'` and `classification` set from `FLD_ZONE`.

---

## 4. HIFLD Electric Transmission Lines

| Field | Value |
|---|---|
| **Provider** | Homeland Infrastructure Foundation-Level Data (HIFLD) |
| **Source URL** | https://hifld-geoplatform.opendata.arcgis.com/datasets/electric-power-transmission-lines |
| **Format** | Shapefile / GeoJSON |
| **Fields used** | Line geometry, `VOLTAGE`, `TYPE` |
| **Default buffer** | 30 metres each side (planning assumption) |
| **Demo status** | SYNTHETIC demo data used |
| **Licence** | Public domain |

### Notes

- HIFLD provides infrastructure data for homeland security purposes,
  including electric power transmission lines.
- The source data is **line** geometry. LandScope buffers the lines by
  the configured buffer distance (default 30 m) to create a corridor
  polygon for exclusion.
- The 30 m default buffer is a **planning assumption**. Real transmission
  line setbacks depend on voltage level, tower type, and local
  regulations. Users can adjust the buffer per analysis request.
- In the demo data, transmission features are stored as pre-buffered
  corridor polygons (not lines) for simplicity.

### Importing real data

1. Download the Electric Power Transmission Lines shapefile from HIFLD.
2. If the data is in line format, buffer it during import or let the
   analysis service buffer it at query time (set `buffer_meters` in the
   analysis request).
3. Reproject to EPSG:32614 and load into `constraint_features` with
   `layer_type = 'transmission'`.

---

## Data Attribution Summary

LandScope displays attribution for each dataset in the UI and API
responses. The `dataset_metadata` table stores provider, source URL,
licence, and retrieval date for each dataset. This information is
available via the `/api/v1/datasets` endpoint.

All datasets are from U.S. federal or state government sources and are
in the public domain unless otherwise noted. LandScope does not claim
ownership of any dataset; it is a tool for analyzing data provided by
these authoritative sources.

---

## Disclaimer

The data used by LandScope is for **screening purposes only**. It does
not constitute a legal determination of buildability. Wetland
delineations, flood zone boundaries, and transmission line locations
should be verified by qualified professionals before any construction
or development decisions are made.
