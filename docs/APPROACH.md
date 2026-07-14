# LandScope: Approach & Design Decisions

This document describes how LandScope interprets the buildable-land analysis
problem, the geometry model it implements, the tradeoffs made, and what would
be done next with more time.

---

## 1. Problem Interpretation

LandScope answers a single question for a given land parcel:

> **How much of this parcel is buildable after applying environmental and
> infrastructure constraints?**

The constraints considered are:

| Layer | Source | Default buffer |
|---|---|---|
| Wetlands | USFWS National Wetlands Inventory | 30 m (planning assumption) |
| Flood hazard | FEMA National Flood Hazard Layer | 0 m |
| Transmission lines | HIFLD Electric Transmission Lines | 30 m (planning assumption) |
| Manual exclusion | User-drawn polygon | 0 m (raw polygon) |

The output is:

- **Total buildable area** (acres and % of parcel).
- **Excluded area** (acres and % of parcel).
- **Per-constraint breakdown** with non-double-counted (uniquely attributed)
  acreage.
- **GeoJSON geometries** for the parcel, buildable area, excluded area, and
  each constraint's clipped intersection — all in WGS84 (EPSG:4326) for
  display on a web map.

LandScope is explicitly a **screening tool**, not a legal or engineering
determination. All buffers are planning assumptions, not verified regulatory
setbacks.

---

## 2. Geometry Model

### Notation

| Symbol | Meaning |
|---|---|
| `P` | Parcel polygon (in analysis CRS) |
| `C_i` | The i-th constraint layer's geometry, already buffered and clipped to `P` |
| `M_exclude` | Union of user-drawn manual exclusion polygons, clipped to `P` |
| `M_restore` | Union of user-drawn manual restoration polygons, clipped to `P` |

### Formulas

The buildable area is computed via a sequence of set operations on polygon
geometries. All operations are performed in the projected analysis CRS
(EPSG:32614) so that buffer distances are in metres.

**Step 1 — Per-layer clipped exclusion:**

For each enabled constraint layer `i`, buffer the raw features by the
configured `buffer_meters`, union them, and clip to the parcel:

```
C_i = ( ⋃ features_i , buffered by buffer_meters_i ) ∩ P
```

**Step 2 — System exclusion:**

Union all per-layer clipped geometries:

```
system_exclusion = ⋃ C_i
```

**Step 3 — Combined exclusion:**

Union the system exclusion with manual exclusions:

```
combined_exclusion = system_exclusion ∪ M_exclude
```

**Step 4 — Effective exclusion:**

Subtract manual restorations, then clip back to the parcel (restorations
cannot "add" land outside the parcel):

```
effective_exclusion = ( combined_exclusion − M_restore ) ∩ P
```

**Step 5 — Buildable area:**

```
buildable = P − effective_exclusion
```

**Step 6 — Areas:**

All areas are computed in the projected CRS (square metres), then converted
to acres using the exact divisor `4046.8564224`:

```
parcel_acres     = area(P) / 4046.8564224
excluded_acres   = area(effective_exclusion) / 4046.8564224
buildable_acres  = area(buildable) / 4046.8564224
buildable_pct    = area(buildable) / area(P) × 100
```

**Invariant check:**

```
| area(P) − area(buildable) − area(effective_exclusion) | < tolerance
```

The default tolerance is `1.0 m²`. If this is exceeded, a warning is emitted
in the response. This catches numerical drift from repeated set operations.

### Sliver removal

After every difference and intersection, polygon parts smaller than
`SLIVER_TOLERANCE_SQM` (default `0.01 m²` = 1 cm²) are removed. This
prevents tiny sliver polygons from appearing in the output and inflating
feature counts.

---

## 3. Unique-Attribution Strategy (Ordered Priority)

### The double-counting problem

If a wetland and a floodplain overlap on the same part of a parcel, simply
summing each layer's `area(C_i ∩ P)` would count the overlapping region
twice. The total would exceed the actual excluded area.

### Solution: ordered unique attribution

LandScope assigns each square metre of exclusion to **exactly one**
constraint, in a fixed priority order:

```
CONSTRAINT_PRIORITY = ["wetlands", "floodplain", "transmission", "manual_exclusion"]
```

The algorithm uses a **remaining polygon** approach:

```
remaining = P

for each constraint_type in priority_order:
    if constraint_type == "manual_exclusion":
        continue  # handled after system constraints

    raw_geom = C[constraint_type]  # already clipped to P

    # What this layer covers that hasn't been claimed by a higher-priority layer:
    unique_part = raw_geom ∩ remaining

    # Remove it from remaining:
    remaining = remaining − unique_part

    # Record:
    raw_intersection_acres  = area(raw_geom ∩ P) / 4046.8564224
    uniquely_removed_acres  = area(unique_part) / 4046.8564224
```

Manual exclusion is processed after all system constraints:

```
if M_exclude is not empty:
    unique_part = M_exclude ∩ remaining
    remaining = remaining − unique_part
```

Manual restoration is recorded as a **negative** entry (land added back):

```
if M_restore is not empty:
    restore_acres = −area(M_restore) / 4046.8564224
```

### Guarantee

The sum of all `uniquely_removed_acres` values (including the negative
restoration entry) equals `excluded_acres` within the area invariant
tolerance. No square metre is counted twice.

---

## 4. Manual Exclusion / Restoration Semantics

### Manual exclusion (`M_exclude`)

A user draws one or more polygons to mark areas they want excluded from
buildable land — for example, a planned driveway, a steep slope they
identified on-site, or a setback they want to model that the system
doesn't capture.

Manual exclusions are **additive** to system constraints: they are unioned
with the system exclusion before restoration is applied.

### Manual restoration (`M_restore`)

A user draws one or more polygons to **override** a system constraint — for
example, if the user believes a wetland delineation is outdated and the area
has been confirmed as non-wetland by a field survey.

Restorations are **subtractions from the combined exclusion**:

```
effective_exclusion = combined_exclusion − M_restore
```

### Why restoration is a user override, not a correction

Restoration does **not** modify the underlying dataset. The wetland polygon
still exists in the database. The restoration is a **scenario override** for
the current analysis only. This is by design:

1. **Auditability**: The original constraint data is preserved. The user's
   override is visible as a separate geometry in the response.
2. **Non-authoritative**: LandScope is a screening tool. A user drawing a
   restoration polygon does not constitute a legal or regulatory
   determination. The response explicitly labels restorations as overrides.
3. **Reversibility**: Because the override is per-request, it can be removed
   by simply not including it in the next analysis. No data mutation is
   needed.
4. **Clipping**: Restorations are clipped to the parcel (`∩ P`) so they
   cannot "add" land outside the parcel boundary.

The breakdown table shows restoration as a **negative** acreage entry,
making it clear that land was added back, not removed.

---

## 5. CRS Decision: EPSG:32614 (UTM Zone 14N)

### Why a projected CRS?

Area calculations require a **projected** CRS (units in metres), not a
geographic CRS like EPSG:4326 (units in degrees). Computing polygon area in
degrees produces meaningless numbers. Web Mercator (EPSG:3857) preserves
angles but severely distorts area at higher latitudes — a 1° × 1° cell near
the equator is ~12,390 km² but only ~7,940 km² at 60° latitude.

### Why UTM Zone 14N?

Brazos County, Texas (home of the demo data, centered on Bryan/College
Station at approximately 96.33°W, 30.63°N) falls within **UTM Zone 14N**.

UTM zones are 6°-wide longitudinal strips. Zone 14N covers longitudes
**96°W to 90°W**. Bryan/College Station at 96.33°W is within this zone
(though near its western edge — see Tradeoffs below).

UTM Zone 14N (EPSG:32614) provides:

- **Metre units** — buffer distances and areas are directly in metres.
- **Low distortion** within the zone — scale factor error is < 0.1% within
  the zone's central meridian ± 3°. Brazos County is within this band.
- **Standard, well-supported CRS** — every GIS library, database, and tool
  recognizes EPSG:32614.

### What about Texas statewide CRS options?

Texas has several state plane coordinate systems (e.g., EPSG:2276 for
Texas Central in feet, EPSG:32139 for Texas Central in metres). These would
also be appropriate and offer slightly lower distortion for Texas-specific
work. UTM was chosen because:

1. It is **globally understood** and requires no explanation for
   non-Texas audiences.
2. The demo county (Brazos) is well within the low-distortion band of
   Zone 14N.
3. UTM zones make it obvious how to switch CRS for other counties in
   different zones (change the EPSG code — the code path is identical).

### What about the western edge concern?

Brazos County's western boundary is near 96.5°W, close to the Zone 14/13
boundary at 96°W. At the zone edge, UTM scale distortion is at its maximum
(~0.04% at the zone boundary for this latitude). For a screening tool
operating on parcels of a few hundred acres, this is negligible — it
amounts to less than 0.1 acres of error on a 100-acre parcel. If
sub-centimetre accuracy were needed, a state plane CRS would be preferable.

---

## 6. Tradeoffs

### Simplicity vs. flexibility

- **Single hardcoded CRS** (EPSG:32614): Simple, but means the system only
  works correctly for UTM Zone 14N counties. Supporting other zones would
  require per-county CRS configuration. This is acceptable for the demo
  (Brazos County only) and easy to extend.

- **Synchronous SQLAlchemy** (psycopg2): Simpler than async, no event loop
  complexity. Scales to moderate concurrency. For very high throughput,
  async (asyncpg) would be better, but that adds complexity to the geometry
  pipeline (Shapely is sync).

### Accuracy vs. performance

- **Shapely in Python** for all geometry operations: Slower than doing set
  operations in PostGIS, but keeps the logic in application code where it
  is testable and debuggable. PostGIS operations would require more complex
  SQL and make the analysis harder to unit-test.

- **GiST spatial indexes** on all geometry columns: Ensures the spatial
  pre-filter (`get_intersecting`) is fast even with millions of constraint
  features.

### Screening vs. regulatory accuracy

- **Default buffers are planning assumptions**, not legal setbacks. Real
  setback distances vary by jurisdiction, wetland type, and flood zone.
  LandScope exposes configurable buffers so users can adjust, but the
  defaults are clearly labeled as non-authoritative.

- **No owner names**: Parcel records intentionally omit owner names from
  API responses to avoid privacy concerns in a screening tool.

---

## 7. Scope Decisions

### In scope

- Single-parcel analysis with configurable constraint buffers.
- Four constraint layers (wetlands, floodplain, transmission, manual).
- Manual exclusion and restoration polygons.
- Non-double-counted breakdown via ordered unique attribution.
- GeoJSON output in WGS84 for web map display.
- Synthetic demo data for end-to-end testing.

### Out of scope (for this version)

- **Multi-parcel batch analysis**: The API processes one parcel at a time.
- **Real data ingestion pipelines**: Scripts for downloading and importing
  authoritative data from TNRIS, USFWS, FEMA, and HIFLD are documented
  (see `docs/DATA_SOURCES.md`) but not fully automated.
- **User authentication**: No auth; the API is open for the demo.
- **Result persistence**: Analysis results are computed on-demand and not
  stored. Each request re-runs the full pipeline.
- **Vector tile serving**: Geometries are returned as GeoJSON in the API
  response. For large datasets, vector tiles would be needed (see below).
- **3D / elevation analysis**: Only 2D polygon area is considered.
- **Permitting workflow**: LandScope does not model the permitting process.

---

## 8. What Would Be Done Next

### Vector tiles

Currently, geometries are returned as full GeoJSON in the API response. For
large counties with thousands of parcels or dense wetland networks, this
does not scale — a single response could be megabytes of JSON.

**Migration path:**
- Use [pg_tileserv](https://github.com/CrunchyData/pg_tileserv) or a custom
  tile endpoint to serve geometries as Mapbox Vector Tiles (MVT).
- The frontend loads tiles on-demand at the current zoom level, only
  fetching features visible in the viewport.
- The analysis API returns only IDs and areas, not geometries; the frontend
  fetches geometries separately via tiles.

### Dataset partitioning

The `constraint_features` table stores all layers in one table. For very
large datasets, this becomes a bottleneck even with GiST indexes.

**Migration path:**
- Partition `constraint_features` by `layer_type` (declarative partitioning
  in PostgreSQL). Each partition has its own GiST index.
- Queries filtered by `layer_type` scan only one partition.
- For county-level partitioning, add a `county_fips` column and partition
  by it (or by a composite of `layer_type + county_fips`).

### Materialized overlay precomputation

For common configurations (default buffers, all layers enabled), the
per-layer clipped geometry `C_i` could be precomputed and materialized.

**Migration path:**
- Create a materialized view or precomputed table:
  `parcel_constraint_overlay(parcel_id, layer_type, geometry)`.
- Refresh incrementally when new parcels or constraint features are
  ingested.
- The analysis service reads precomputed overlays instead of computing
  them per-request, reducing latency from O(k) feature loads + buffers to
  O(1) overlay lookups.

### Redis caching

Analysis results for a given `(parcel_id, constraints_config,
manual_edits)` tuple are deterministic. Caching avoids recomputation.

**Migration path:**
- Hash the request body to create a cache key.
- Store the full `AnalysisResponse` in Redis with a TTL (e.g., 1 hour).
- Invalidate on data ingestion (new parcels or constraint features).
- Use cache headers (`ETag` / `If-None-Match`) for client-side 304
  responses.

### Batch jobs

For precomputing overlays or refreshing materialized views, a background
job system is needed.

**Migration path:**
- Use a task queue (e.g., Celery with Redis, or PostgreSQL's `LISTEN`/
  `NOTIFY` for simpler cases).
- Ingestion triggers a "recompute overlays for affected parcels" job.
- Jobs are idempotent and retried with exponential backoff.

### Horizontal API scaling

The FastAPI backend is stateless (no server-side session), so it scales
horizontally behind a load balancer.

**Migration path:**
- Run multiple `uvicorn` workers per container (already configured: 2
  workers).
- Run multiple backend containers behind the nginx reverse proxy.
- Use connection pooling (pgbouncer) to share DB connections across
  containers.
- Add rate limiting and request queuing for very high traffic.

---

## 9. Hidden PDF Instructions

During the problem analysis, a set of instructions was identified that
appeared to be embedded or "hidden" in a PDF document associated with the
project brief. These instructions were reviewed and **deliberately not
implemented** because:

1. They were not part of the explicitly stated requirements.
2. Implementing undocumented instructions would compromise the
   transparency and auditability of the analysis pipeline.
3. The visible specification was complete and self-consistent.

All functionality is based on the openly documented requirements. No
behavior is influenced by hidden or undocumented instructions.
