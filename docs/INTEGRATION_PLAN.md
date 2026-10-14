# Integration Plan — GIS platform on the existing ZHMS core

*Step 0, 2026-10-13. Proposal only; nothing starts until you confirm SYSTEM_UNDERSTANDING.md and answer
RISKS_AND_QUESTIONS.md. Assumes Q1 = the ZHMS core (`zhms-api` + React `src/`) is the foundation.*

## Principles

- **Your app wins.** The brief is adapted to ZHMS: existing tables, triggers, roles, naming and the dark-slate UI are
  reused; nothing that already works is rewritten.
- **Additive, reversible migrations** (`011_…` onwards), each with a backup step (`pg_dump`) and a down-script;
  no column is dropped or renamed.
- **PostgreSQL is the single stand register.** Status stays derived by trigger from allocations; geometry stays in
  `la_spatial_unit.boundary_geojson` (WGS84) with PostGIS `geom` derived from it.
- **Everything self-hosted** in Docker Compose; the ERP keeps working if a GIS container is down.
- Every phase: run the existing 64 API tests before and after, add tests for what is touched, update
  SYSTEM_UNDERSTANDING.md and GAP_ANALYSIS.md, write a CHANGELOG entry and manual test steps, then stop.

## Phase 0 — make the foundation safe (small, required first)

| Step | Change | Why |
|---|---|---|
| 0.1 | Agree file ownership with Antigravity (Q2); commit the current state | Stop silent overwrites (R2) |
| 0.2 | Restore a minimal Vite entry page (`index.html` → `<div id="root">` + `/src/main.tsx`); move the prototype page to `erp.html` | React client unreachable (R3) |
| 0.3 | Run PostgreSQL + PostGIS in Docker for development (data volume, port 5433 so the Windows PostgreSQL is untouched); apply 002/009; back up first | PostGIS needed for everything (R15) |
| 0.4 | Stop exposing the Python ERP publicly (remove `/api/erp/` from nginx or require the ZHMS JWT) | No authentication (R1) |
| 0.5 | Remove default secrets from `docker-compose.yml`; add SQLAlchemy to `requirements.txt` or drop the unused import | R10, R11 |
| 0.6 | Fix the EPSG comment in a new migration note (no schema change) | R7 |

## Phase 1 — core map + ERP (demo-ready)

| Item | Existing | Smallest change |
|---|---|---|
| Local basemaps (streets/light/dark, satellite, drone, topo) | Leaflet + external tiles | `setup/` script: download Geofabrik Zimbabwe once → Planetiler → PMTiles; serve with Martin (or static PMTiles via nginx); Sentinel-2 COGs + TiTiler for satellite. Remove Esri/CARTO/OSM URLs |
| MapLibre map | `InteractiveLeafletMap.tsx` | New `components/gis/EstateMap.tsx` (MapLibre); keep the Leaflet map until parity, then remove |
| Vector tiles of stands | one GeoJSON per development | Martin publishing a SQL function over `la_spatial_unit` (status, price/m², servicing, arrears bucket, no personal data) |
| Status colours + legend | exists | Port; map to Q4 derived statuses |
| Stand side panel | inspector + separate tabs | One panel calling existing endpoints (statement, documents, servicing) + role actions that already exist (reserve, record payment, sign) |
| Google Maps / directions / share links | — | Plain `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` from stored centroid |
| Unified search | client-side filter | `GET /api/v1/search?q=` (stands, buyers by ID — staff only, phases, status, size, price) |
| Map modes | status, servicing | Add arrears (needs ageing buckets from `plan_installments`), price/m², construction stage |
| Real-time | none | PostgreSQL `LISTEN/NOTIFY` from the existing status trigger → WebSocket (`ws` package) → map refresh |
| Reservation timer | job exists | Show countdown from `reservation_expires_at` |
| Double allocation | exists (DB) | Nothing to build — keep tests |
| Phases | — | `phases` table (development_id, name, boundary, water/sewer/power/roads status) + `la_spatial_unit.phase_id` (nullable) |
| Stand history | audit only | `stand_history` table filled by trigger on status/price/geometry/holder change |

**Already done (skip):** double-allocation protection, reservation expiry, status derivation, public register,
servicing gate on deeds.

## Phase 2 — parcel management, survey tools, import/export

- Editor in MapLibre (draw/vertex edit/snap via `maplibre-gl-draw` or Terra Draw — both open source); split/merge
  done in PostGIS (`ST_Split`, `ST_Union`) through new endpoints; undo/redo client-side.
- Topology checks as SQL (`ST_IsValid`, overlaps via `ST_Intersects`/`ST_Area`, gaps against the phase boundary,
  slivers by area/compactness, duplicate numbers) returning features for highlighting.
- Replace the SG parser's approximation with PROJ (`proj4js` client or `ST_Transform` server) for Lo 29/31 and UTM
  35S/36S (Q9). Coordinate-table stand creation reuses `importStands`.
- Import wizard extends the existing all-or-nothing `importStands` (keeps its validation): GDAL (`ogr2ogr` in a
  container) converts Shapefile/KML/KMZ/GPX/DXF/GeoPackage/CSV to GeoJSON; field-mapping templates stored in a new
  `import_templates` table; every created stand records its source file in `stand_history`.
- Exports (KML/KMZ styled by status, CSV, GeoJSON, Shapefile, GeoPackage, DXF) via GDAL; stand diagram PDF via
  WeasyPrint or Puppeteer with a MapLibre snapshot (bearings already computed by `computeBoundaryTraverse`).
- Auto-subdivision: server-side PostGIS algorithm (road reserve buffer + grid slicing to target frontage/area)
  producing **draft** stands in a separate table until approved.

## Phase 3 — planning, zoning, compliance

- `overlay_layers` table (zoning, wetland, flood, servitude, road reserve) — existing `land_constraint` stands are
  migrated into overlays, while the WITHDRAWN rule stays.
- Rule engine: `planning_rules` (type, distance/area thresholds, block or warn) evaluated in `reserveStand`
  before the insert — same place the quota rule lives today.
- PostGIS analysis endpoints (buffer, intersect, clip, dissolve, nearest).
- DEM: Copernicus GLO-30 downloaded once → PostGIS raster; slope/aspect/contours/hillshade via GDAL; per-stand
  elevation/slope stored on `la_spatial_unit`.
- Services: extend per-stand certification with **power**; phase roll-up; configurable "transfer requires
  services" rule feeding the existing `assert_title_gate` trigger. Replace the synthetic utility overlay with real
  line/point layers.

## Phase 4 — site selection, feasibility, marketing

Photon (geocoding) and Valhalla (routing + isochrones) containers built from the same OSM extract; amenities from
OSM in PostGIS; site scoring + feasibility PDF; `land_prospects` pipeline; embeddable public map built on the
existing public register endpoints (no personal data) with an enquiry form creating `leads`; buyer portal extended
from the existing Owner Portal; MapLibre 3D extrusions.

## Phase 5 — dashboards and reporting

SQL views over allocations/payments/instalments (sales per month, collections vs target, arrears ageing, revenue by
phase, velocity, projected sell-out); charts cross-filtered with the map; time slider over `stand_history`; PDF and
XLSX reports; scheduled email only when an email provider is configured.

## Phase 6 — field operations (offline-first)

PWA manifest + service worker on the React client; offline packages (PMTiles extract + stands GeoJSON per project);
GPS capture, photos and stage notes queued in IndexedDB and synced with conflict detection; QR codes per stand
(generated locally) that open the stand record; stand-level construction stages linked to the construction module.

## Phase 7 — security, automation, AI

Keycloak (or chosen IdP, Q7) for login, 2FA and password policy, issuing the JWTs ZHMS already verifies; role
mapping to the brief's roles; tenant isolation if Q6 = yes; encrypted `pg_dump` backups; geometry + import source in
the audit log; generic approvals (price change, transfer); event automation (agreement PDF on signing, map refresh
on payment); optional local AI assistant via Ollama with a read-only database role.

## Phase 8 — optional Google basemap

Not built unless you approve it later.

## What is unnecessary because it already exists

Double-allocation locks; reservation auto-release; derived stand status; servicing certification and deed gate;
hash-chained audit log; append-only ledger with idempotent payment references; instalment plans with true-rate
disclosure; SMS/WhatsApp queue with pluggable providers; public allocation register without personal data;
construction job costing, site progress, tenders, QC and plant.
