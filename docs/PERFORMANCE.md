# LandScope: Performance

This document describes the current performance characteristics of
LandScope, expected bottlenecks, and the migration path for scaling to
larger datasets and higher traffic.

---

## 1. Current Request Complexity

A single analysis request runs in **O(k)** time, where `k` = the number of
candidate constraint features returned by the spatial pre-filter.

### Breakdown

| Step | Complexity | Notes |
|---|---|---|
| Load parcel | O(1) | Indexed by primary key (UUID) |
| Spatial pre-filter | O(log n + k) | GiST index lookup; `n` = total features in layer, `k` = candidates in envelope |
| Buffer + union per layer | O(k_i) | `k_i` = candidates for layer `i`; Shapely `unary_union` |
| Clip to parcel | O(k_i) | Intersection with parcel polygon |
| Effective exclusion | O(1) | Union of ≤4 layer geometries + manual edits |
| Buildable area | O(1) | Single difference operation |
| Area computation | O(1) | Shapely `.area` |
| Breakdown (unique attribution) | O(m) | `m` = number of enabled constraints (≤4) |
| GeoJSON serialization | O(v) | `v` = total vertices in output geometries |

### Typical latency

| Scenario | Expected latency |
|---|---|
| Small parcel, few constraints (demo) | 50–150 ms |
| Medium parcel, all 4 layers, dense features | 150–500 ms |
| Large parcel, many overlapping features | 500 ms – 2 s |

The dominant cost is the Shapely geometry operations (buffer, union,
intersection), not the database query.

---

## 2. Spatial Index Strategy

All geometry columns have **GiST (Generalized Search Tree)** indexes:

| Table | Column | Index |
|---|---|---|
| `parcels` | `geometry` (EPSG:32614) | `ix_parcels_geometry_gist` |
| `parcels` | `geometry_wgs84` (EPSG:4326) | `ix_parcels_geometry_wgs84_gist` |
| `parcels` | `centroid_wgs84` (EPSG:4326) | `ix_parcels_centroid_wgs84_gist` |
| `constraint_features` | `geometry` (EPSG:32614) | `ix_constraint_features_geometry_gist` |

### How GiST helps

The spatial pre-filter query uses the `&&` (bounding box overlap) operator:

```sql
SELECT * FROM constraint_features
WHERE geometry && ST_MakeEnvelope(...)
  AND layer_type = ANY(:layer_types)
```

With a GiST index, this is an **index scan** that returns only features
whose bounding boxes intersect the query envelope — typically a small
fraction of the total. Without the index, this would be a full table
scan (O(n)).

### Envelope expansion

The query envelope is the parcel's bounding box expanded by the maximum
configured buffer distance + 100 m safety margin. This ensures all
features that could intersect the parcel after buffering are included.

---

## 3. Expected Bottlenecks

### 1. Shapely geometry operations (CPU-bound)

`unary_union` of many features is the most expensive operation. For a
parcel with 500 nearby wetland polygons, the union can take 200–500 ms.
This is CPU-bound and does not benefit from more database memory.

**Mitigation**: Pre-union features per layer during ingestion (see
Materialized Overlay Precomputation below).

### 2. GeoJSON serialization (CPU + bandwidth)

Large output geometries (e.g., a parcel with a complex boundary and many
exclusion slivers) produce large GeoJSON responses. A 100-vertex parcel
with 50 exclusion polygons can produce 50+ KB of JSON.

**Mitigation**: Simplify geometries before serialization
(`ST_Simplify` or Shapely `.simplify()`). Use vector tiles instead of
full GeoJSON for map display.

### 3. Database connection pool (concurrency)

The backend uses a synchronous connection pool (psycopg2). With 2
uvicorn workers and default pool settings, the system handles ~20–50
concurrent requests before connections are exhausted.

**Mitigation**: Add pgbouncer for connection pooling. Increase pool
size. Switch to async (asyncpg) for higher concurrency.

### 4. Large envelope queries (I/O)

If a parcel is very large (e.g., a ranch with thousands of acres), the
expanded envelope may cover a huge area, returning many candidate
features even if few actually intersect.

**Mitigation**: Use `ST_Intersects` (exact geometry intersection) as a
secondary filter after the GiST bounding-box pre-filter. This is already
the behavior — the pre-filter returns candidates, and Shapely does the
exact intersection.

---

## 4. Behavior with Larger Counties

### Brazos County (demo)

- ~50,000 parcels
- ~1,000 wetland features
- ~200 floodplain features
- ~50 transmission line features

At this scale, the current architecture works well. Each analysis
request loads only the features near the target parcel (typically < 20
candidates), and the GiST index makes the pre-filter fast.

### Harris County (Houston) — ~1.2M parcels, ~50K wetland features

At this scale, the `constraint_features` table grows to ~50K+ rows per
layer. The GiST index still makes the spatial pre-filter fast (log n),
but:

- The table is larger, so cache hit rates may drop.
- More features per envelope (denser urban area), so `k` is larger.
- `unary_union` of 100+ features per request becomes noticeable.

**Expected latency**: 200–800 ms per request. Acceptable for interactive
use but approaching the limit for a smooth UX.

### Statewide (Texas) — ~10M parcels, ~500K wetland features

At statewide scale, the single-table architecture breaks down:

- The `constraint_features` table has millions of rows. Even with GiST,
  queries touch large indexes.
- Memory pressure: the GiST index for 500K features is ~100+ MB.
- Ingestion takes hours, not minutes.

**This requires the scaling strategies below.**

---

## 5. Vector-Tile Migration Strategy

### Problem

Returning full GeoJSON geometries in API responses does not scale to
large datasets. A single analysis response with complex geometries can
be 100+ KB. Loading thousands of parcels for a county map view would
be megabytes.

### Solution: Mapbox Vector Tiles (MVT)

Vector tiles are compact, pre-computed geometries served at zoom-appropriate
resolution. The browser only loads tiles for the visible viewport.

### Migration path

1. **Add a tile-serving endpoint** (or use [pg_tileserv](https://github.com/CrunchyData/pg_tileserv)):
   ```
   GET /api/v1/tiles/parcels/{z}/{x}/{y}.mvt
   GET /api/v1/tiles/constraints/{layer}/{z}/{x}/{y}.mvt
   ```

2. **PostGIS `ST_AsMVT`** generates tiles directly from the database:
   ```sql
   SELECT ST_AsMVT(tile.*, 'parcels', 4096, 'geom')
   FROM (
     SELECT id, source_id, ST_AsMVTGeom(
       ST_Transform(geometry, 3857),
       ST_TileEnvelope(:z, :x, :y),
       4096, 64, true
     ) AS geom
     FROM parcels
     WHERE geometry && ST_Transform(ST_TileEnvelope(:z, :x, :y), 32614)
   ) AS tile;
   ```

3. **Frontend switches from GeoJSON to tiles**: MapLibre GL JS natively
   supports MVT sources. The map loads tiles on-demand; the analysis
   API returns only IDs and areas, not geometries.

4. **Tile cache**: nginx or CDN caches tiles at the edge. Tiles are
   immutable per `(layer, z, x, y)` until data changes.

### Expected impact

- Map load time: **10× faster** for county-wide views.
- Bandwidth: **90% reduction** (tiles are ~1–10 KB each vs. MB of GeoJSON).
- Server CPU: Lower (tiles are pre-computed; `ST_AsMVT` is fast with
  GiST indexes).

---

## 6. Dataset Partitioning

### Problem

A single `constraint_features` table with millions of rows has large
indexes and slower scans, even with GiST. Queries filtered by
`layer_type` still scan the full index.

### Solution: Declarative partitioning

PostgreSQL supports declarative partitioning by list or range.

#### Option A: Partition by `layer_type`

```sql
CREATE TABLE constraint_features (
    id UUID DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL,
    layer_type TEXT NOT NULL,
    source_id TEXT,
    classification TEXT,
    geometry geometry(GEOMETRY, 32614) NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT now()
) PARTITION BY LIST (layer_type);

CREATE TABLE constraint_features_wetlands
    PARTITION OF constraint_features FOR VALUES IN ('wetlands');
CREATE TABLE constraint_features_floodplain
    PARTITION OF constraint_features FOR VALUES IN ('floodplain');
CREATE TABLE constraint_features_transmission
    PARTITION OF constraint_features FOR VALUES IN ('transmission');
```

Each partition has its own GiST index. A query for `layer_type =
'wetlands'` scans only the wetlands partition.

#### Option B: Partition by county

Add a `county_fips` column and partition by it. This is useful for
statewide deployments where queries are always county-scoped.

### Expected impact

- Query latency: **2–5× faster** for layer-filtered queries (scan one
  partition instead of full table index).
- Ingestion: Can parallelize per partition.
- Maintenance: Vacuum/reindex per partition independently.

---

## 7. Materialized Overlay Precomputation

### Problem

Every analysis request recomputes per-layer buffered+clipped geometries
from scratch. For common configurations (default buffers, all layers),
this is redundant work.

### Solution: Precompute overlays

Create a materialized table that stores the precomputed `C_i` for each
`(parcel, layer)` pair:

```sql
CREATE TABLE parcel_constraint_overlay (
    parcel_id UUID REFERENCES parcels(id),
    layer_type TEXT NOT NULL,
    geometry geometry(MULTIPOLYGON, 32614) NOT NULL,
    area_sqm NUMERIC NOT NULL,
    computed_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (parcel_id, layer_type)
);

CREATE INDEX ix_overlay_geometry_gist
    ON parcel_constraint_overlay USING GIST (geometry);
```

### Refresh strategy

- **Full refresh**: `TRUNCATE` + recompute for all parcels. Run as a
  nightly batch job. Suitable for demo / small counties.
- **Incremental refresh**: When a parcel or constraint feature is
  inserted/updated, recompute only the affected overlays. Use a "dirty
  queue" table to track which overlays need recomputation.

### Analysis service change

The analysis service checks the overlay table first. If a precomputed
overlay exists for the requested `(parcel, layer, buffer)` combination,
it uses it directly. Otherwise, it falls back to on-demand computation
and optionally writes the result to the overlay table for future use.

### Expected impact

- Analysis latency: **5–20× faster** for precomputed parcels (O(1)
  lookup vs. O(k) feature loading + buffering).
- Ingestion: Adds a post-ingestion step (batch job).
- Storage: One row per `(parcel, layer)` pair — manageable for
  ~50K parcels × 3 layers = 150K rows.

---

## 8. Redis Caching

### Problem

Analysis results are deterministic for a given
`(parcel_id, constraints_config, manual_edits)` tuple. Recomputing
identical requests wastes CPU.

### Solution: Redis response cache

1. **Hash the request body** to create a cache key:
   ```
   key = f"analysis:{hashlib.sha256(request_json).hexdigest()}"
   ```

2. **Store the full `AnalysisResponse`** in Redis with a TTL (e.g.,
   1 hour):
   ```
   SET analysis:<hash> <response_json> EX 3600
   ```

3. **On request**: Check Redis first. If hit, return cached response
   with `X-Cache: HIT` header. If miss, compute, store, return with
   `X-Cache: MISS`.

4. **Invalidation**: When new data is ingested (new parcels or
   constraint features), flush the analysis cache:
   ```
   DEL analysis:*
   ```
   Or use a versioned key prefix (`analysis:v2:<hash>`) and bump the
   version on ingestion.

### Expected impact

- Repeated requests: **< 5 ms** (Redis lookup vs. 200–500 ms compute).
- Cache hit rate: High for interactive use (users often re-run the
  same analysis with minor tweaks).
- Memory: ~50 KB per cached response. 10K cached responses = ~500 MB
  Redis memory.

---

## 9. Horizontal API Scaling

The FastAPI backend is **stateless** — no server-side session, no
result storage. This means it scales horizontally behind a load balancer.

### Current setup

- 1 backend container
- 2 uvicorn workers per container
- Synchronous psycopg2 with default pool size (5 connections per worker)

**Capacity**: ~10–20 concurrent requests before connection pool
exhaustion.

### Scaling path

| Step | Change | Expected capacity |
|---|---|---|
| 1 | Add pgbouncer (connection pooling) | 50–100 concurrent |
| 2 | Run 3 backend containers behind nginx | 150–300 concurrent |
| 3 | Switch to async (asyncpg + async SQLAlchemy) | 500+ concurrent |
| 4 | Add Redis cache (90%+ hit rate) | 1000+ concurrent (cache hits) |

### Load balancer config

nginx already acts as the reverse proxy. To add multiple backend
instances, update `nginx.conf`:

```nginx
upstream backend_pool {
    server backend1:8000;
    server backend2:8000;
    server backend3:8000;
}

location /api/ {
    proxy_pass http://backend_pool/api/;
}
```

In `docker-compose.yml`, scale the backend service:

```yaml
backend:
  # ...
  deploy:
    replicas: 3
```

---

## 10. Metrics to Track

### Application metrics

| Metric | Type | Description |
|---|---|---|
| `analysis_duration_ms` | histogram | End-to-end analysis latency |
| `analysis_candidate_features` | histogram | Number of candidate features loaded |
| `analysis_buildable_acres` | histogram | Buildable area (for distribution analysis) |
| `analysis_warnings_count` | counter | Number of warnings emitted |
| `analysis_area_invariant_delta` | histogram | Deviation from area invariant (m²) |

### Infrastructure metrics

| Metric | Type | Description |
|---|---|---|
| `http_request_duration_seconds` | histogram | Request latency by endpoint |
| `http_requests_total` | counter | Request count by status code |
| `db_connection_pool_size` | gauge | Active DB connections |
| `db_query_duration_seconds` | histogram | Database query latency |
| `redis_cache_hits_total` | counter | Cache hit count |
| `redis_cache_misses_total` | counter | Cache miss count |

### Operational metrics

| Metric | Type | Description |
|---|---|---|
| `container_cpu_usage_percent` | gauge | CPU usage per container |
| `container_memory_usage_bytes` | gauge | Memory usage per container |
| `postgres_database_size_bytes` | gauge | Database size |
| `postgres_table_rows` | gauge | Row count per table |

### Alerting thresholds (suggested)

| Alert | Condition | Severity |
|---|---|---|
| High analysis latency | p95 > 2 s for 5 min | Warning |
| Area invariant violation | delta > 10 m² | Warning |
| DB connection pool exhaustion | pool usage > 80% | Critical |
| High error rate | 5xx > 1% for 5 min | Critical |
| Disk space low | disk usage > 85% | Warning |

---

## Summary

| Scenario | Current | With vector tiles | With partitioning | With materialized overlays | With Redis |
|---|---|---|---|---|---|
| Demo (Brazos) | ✅ 50–150 ms | ✅ | ✅ | ✅ | ✅ |
| Large county | ⚠️ 200–800 ms | ✅ | ✅ | ✅ | ✅ |
| Statewide | ❌ | ✅ | ✅ | ✅ | ✅ |
| High traffic | ⚠️ 20 concurrent | ✅ | ✅ | ✅ | ✅ 1000+ |

The current architecture is optimized for correctness and developer
clarity. The scaling strategies above are additive — each can be
implemented independently without rewriting the core analysis pipeline.
