# Gap Analysis — GIS + ERP brief vs the existing software

*Step 0, 2026-10-13. Status is judged against the **ZHMS core** (`zhms-api` + React `src/`), which is proposed as the
foundation (RISKS_AND_QUESTIONS.md Q1). Where the Python prototype (`server.py` + `index.html`) has something
relevant it is noted, but prototype features keep data in memory and are counted as **Partial** at best.*

Legend: **Exists** · **Partial** · **Missing** · **Conflicts** (the app does the opposite, or the brief would
duplicate/contradict something that already exists).

## Absolute rule — no external map/GIS services

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| No Esri/ArcGIS anywhere | **Conflicts** | `src/components/map/InteractiveLeafletMap.tsx` (World Imagery tiles); `server.py` CSP allows `server.arcgisonline.com` | Remove in Phase 1; replace with local imagery |
| No hosted tile servers (OSM, CARTO, OpenTopoMap) | **Conflicts** | React map, `index.html` | Replace with local PMTiles basemap |
| Libraries installed locally (no CDN) | **Conflicts** (prototype only) | `index.html` loads Leaflet/Tailwind/Font Awesome from CDNs | React client already bundles locally — fine; prototype to be retired or bundled |
| Google Maps only as plain links | Missing | — | Add in Phase 1 |
| Notification providers pluggable, off by default | **Exists** | `zhms-api/src/messaging.js`, `config.js` (console default) | Keep |
| Optional Google basemap behind flag | Missing | — | Do not build (Phase 8, awaiting approval) |

## Self-hosted GIS stack

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| PostgreSQL + PostGIS | **Partial** | migrations 002/009 (geom, GIST index, sync trigger); Docker image `postgis/postgis` | Dev DB has no PostGIS → run PostGIS in Docker locally; apply 002/009 |
| Topology / spatial indexes | Partial | GIST index on `geom` | Add topology checks (Phase 2) |
| MapLibre GL JS rendering | Missing (Leaflet used) | `InteractiveLeafletMap.tsx` | Introduce MapLibre for vector tiles/3D; keep Leaflet only where simpler (decision Q8) |
| Martin / pg_tileserv vector tiles | Missing | stands sent as one GeoJSON FeatureCollection | Add Martin over `la_spatial_unit` |
| OSM Zimbabwe basemap → PMTiles (streets/light/dark) | Missing | — | Setup script + Planetiler |
| Sentinel-2 COGs + TiTiler, drone orthophoto upload | Missing | — | Phase 1 (basemap switcher) / Phase 2 upload |
| Self-hosted geocoder (Nominatim/Photon) + internal search | Missing | — | Phase 1 internal search; Phase 4 Photon |
| pgRouting / OSRM / Valhalla, isochrones | Missing | — | Phase 4 |
| DEM, slope, aspect, contours, hillshade (GDAL) | Missing (prototype has a simple earthworks calculator `src/civil/earthwork_engine.py`) | — | Phase 3 |
| Server-side analysis (PostGIS) + Turf.js | Partial | polygon area/centroid in JS (`gisService.analysePolygon`) | Move to PostGIS; add Turf for client feedback |
| PROJ: store 4326, display 3857, import Arc 1950 UTM 35S/36S | **Partial / Conflicts** | geom stored in EPSG:32736 (WGS84 UTM, comment wrongly says Arc 1950); `spatial/transformer.py` (Python) does correct Arc 1950 Lo→WGS84 | Use PROJ in the API; fix the 32736 vs 20936 confusion (Q9) |
| GDAL/ogr2ogr import/export | Missing | upload modal shows an ogr2ogr command for users to run themselves | Run GDAL server-side (Phase 2) |
| PDF reports with map snapshots | Missing | Agreement/Deed are JSON records, not PDFs | Phase 2/5 |
| Docker Compose single-server install | **Partial** | `docker-compose.yml` (postgres+PostGIS, redis, api, python ERP, nginx) | Extend with tile/geocoder/routing/raster services; fix default secrets |

## Data model

| Target entity | Status | Existing table / code | What to do |
|---|---|---|---|
| Developer/Company (multi-tenant) | **Missing** | single company, no tenant column anywhere | Add `tenants` + `tenant_id` on every business table (additive) — confirm need (Q6) |
| Project/Estate: name, location, area, boundary, status | **Partial** | `developments` (name, code, province, centre, target_units) | Add boundary polygon, total area, status |
| Phase (boundary, water/sewer/power/roads status) | **Missing** (servicing is per stand) | `la_spatial_unit.water/sewer/roads_status` | Add `phases` table; keep per-stand certification; add **power** |
| Stand/Parcel | **Exists (mostly)** | `la_spatial_unit`: stand_number, polygon, area_sqm, zoning_type, price_usd, status, servicing, quota, constraint, SG ref | Add phase_id, perimeter, currency, title_deed_no, servitudes, elevation/slope, QR code, source; area auto-computed from geometry |
| Stand area auto-computed | Partial | computed at import (JS), stored as `area_sqm` | Derive from PostGIS geography area |
| Price currency USD/ZiG | **Conflicts** | prices are USD; ZiG accepted only as payment at a recorded rate | Keep USD ledger unless you decide otherwise (Q5) |
| Buyer/Applicant | **Exists** | `la_party`, `applications`, quotas, channels | Reuse |
| Agreement of Sale | **Exists** | `issued_documents` (AGREEMENT_OF_SALE, hash + verification token) | Add PDF rendering |
| Payment / Instalment | **Exists** | `payments`, `journal_*`, `payment_plans`, `plan_installments`, `installment_settlements`, `payment_inbox` | Reuse |
| Inspection | Partial | construction `quality_inspections` (per project); no stand inspections | Generalise to stands/phases (Phase 6) |
| Document (deeds, diagrams, IDs) | **Partial** | `issued_documents` (generated only); no file uploads | Add `documents` with local file storage |
| Lead | Missing (prototype CRM has inquiries in memory) | `src/erp/sales_crm_pipeline.py` | Add `leads` table (Phase 4) |
| Land Acquisition Prospect | Missing | `src/real_estate_erp` LandParcel (unused) | Add (Phase 4) |
| Task/Approval | Partial | application 3-step approval; construction approvals | Generic approvals (Phase 7) |
| AuditLog | **Exists** | `audit_log` hash chain + `verify_audit_chain()` | Extend with geometry/import source |
| Stand status set (available, reserved, allocated, paid_up, transferred, disputed, blocked) | **Partial / Conflicts** | stand: AVAILABLE/RESERVED/ALLOCATED/DISPUTED/WITHDRAWN; allocation: RESERVED…PAID_IN_FULL/COMPLETED | Map, do not replace: paid_up = allocation PAID_IN_FULL, transferred = COMPLETED (deed), blocked = WITHDRAWN (Q4) |
| History table (geometry, status, price, owner) | **Partial** | audit_log records events; allocations immutable; no geometry/price history | Add `stand_history` (temporal) via trigger |

## Phase 1 — core map + ERP

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| 1. Estate map + basemap switcher (streets/satellite/drone/topo/dark) | **Partial / Conflicts** | Leaflet map with street/satellite/dark from external servers | Local basemaps only |
| 2. Stand polygons labelled, coloured by status, legend | **Exists** | `InteractiveLeafletMap.tsx` (colours, centroid labels, legend) | Port to vector tiles for scale |
| 3. Click stand → side panel (details, buyer, agreement, payments, balance, documents, timeline) + role actions | **Partial** | stand inspector shows details, servicing, holder (staff), reserve button; payments/statement on separate tabs | Build the unified panel from existing endpoints |
| 4. "Open in Google Maps", "Get directions", "Share location" links | Missing | — | Add (centroid already stored) |
| 5. Unified search (stand, buyer, ID, phase, status, size, price) synced with map | Partial | map search by stand number/holder/parcel id + status filter | Server-side search endpoint + list↔map sync |
| 6. Map modes: Status / Arrears / Price per m² / Servicing / Construction progress | **Partial** | modes: cadastre (status), infrastructure (servicing) | Add arrears (needs ageing), price/m², construction |
| 7. Real-time updates (WebSockets) | **Missing** | no WebSocket/SSE anywhere | Add (e.g. PostgreSQL LISTEN/NOTIFY → WebSocket) |
| 8. Reservation hold timer, auto-release | **Exists** | `reservation_days` (7) + `releaseExpiredReservations` job | Show countdown in UI |
| 9. Double-allocation protection | **Exists** | unique partial indexes + `assert_stand_available` trigger; tested with 50 concurrent requests | Keep |

## Phase 2 — parcel management, survey tools, import/export

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Editor: draw, vertex edit, snap, split, merge, delete, undo/redo | Missing (prototype has a click-to-peg demo in browser memory) | `index.html` "Develop Land" tab | Build on PostGIS |
| Auto-subdivision (roads + target stand size) | Missing (unused `LandSurveyorService` in `src/real_estate_erp/services.py` has setback-aware lot slicing) | — | Build server-side; may reuse the slicing idea |
| Topology checks (overlaps, gaps, slivers, invalid, duplicate numbers) + fixes | Partial | import rejects invalid polygons, duplicates, swapped coordinates; no overlap/gap checks | PostGIS checks |
| Auto area/perimeter, deed-area mismatch flag | Partial | area at import; no perimeter or deed area | Add |
| Create stand from beacon coordinates (any projection) | **Partial / Conflicts** | SG schedule parser — flat approximation, wrong for real survey data | Replace with PROJ (Lo 29/31, UTM 35S/36S) |
| Printable stand diagram PDF (beacons, bearings, scale, north arrow, inset) | Missing (`computeBoundaryTraverse` computes lengths/bearings) | `gisService.js` | Add PDF |
| Import wizard: Shapefile, GeoJSON, CSV, GPX, DXF, GeoPackage, KML/KMZ (My Maps, Earth), Takeout, Sheets CSV | **Partial** | GeoJSON (WGS84) + SG schedule only; all-or-nothing validation with per-feature errors | Full wizard with GDAL, field mapping templates, reprojection |
| Validate: overlaps, invalid, duplicates, outside project boundary; error report | Partial | invalid/duplicate/bbox checks exist | Add overlap + boundary checks + downloadable report |
| Export KML/KMZ (styled), CSV, GeoJSON, Shapefile, GeoPackage, DXF, PDF/PNG | Missing (prototype exports GeoJSON/DXF from browser memory) | — | Server-side exports |

## Phase 3 — planning, zoning, compliance

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Overlay layers (zoning, wetlands, flood, servitudes, road reserves) | **Partial** | non-buildable land stored as WITHDRAWN stands with `land_constraint`; zoning per stand | Separate overlay layers table |
| Rule engine (e.g. no residential within 30 m of wetland, min 200 m²) | Partial | hard-coded: constrained land unbookable; densification report; Python `spatial/zoning_validator.py` (100 m wetland buffer) | Admin-defined rules checked at allocation |
| Buffer, intersect, clip, dissolve, nearest-neighbour tools | Missing | — | PostGIS endpoints |
| Elevation, slope, aspect, contours, hillshade, cut/fill per stand | Missing | — | DEM pipeline |
| Services layers per phase with progress; transfer blocked until complete | **Partial** | per-stand water/sewer/roads; deed blocked until all certified (DB trigger) | Add phases, power, line/point layers, configurable rule |
| Land-use summary per project | Partial | `GET /gis/zoning-summary` (high-rise share, protected land) | Extend with open space vs sellable |

## Phase 4 — site selection, feasibility, marketing

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Geocoding + reverse geocoding (self-hosted) | Missing | — | Photon/Nominatim |
| Nearby amenities from local OSM | Missing | — | From the OSM extract in PostGIS |
| Routing + isochrones | Missing | — | Valhalla/OSRM/pgRouting |
| Candidate site scoring + feasibility PDF | Missing (unused `ProformaRun` / proforma service in `real_estate_erp`) | — | Build |
| Land acquisition pipeline | Missing | — | Build |
| Public availability map (no personal data), embeddable, enquiry → lead, directions link | **Partial** | public allocation register + quota summary (no personal data); map hides holder names unless staff | Add embeddable map + enquiry form + leads |
| Buyer portal (stand on map, statement, balance, documents, progress, directions) | **Partial** | Owner Portal: own allocations and statement; proof-of-payment upload exists in the API only (`POST /owner/proof-of-payment`, no UI) | Add map, documents, progress, directions, proof-of-payment form |
| 3D extrusions | Missing | — | MapLibre |

## Phase 5 — dashboards and reporting

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Management dashboard (status, sales/month, collections vs target, arrears ageing, revenue by phase, velocity, sell-out date) | Partial | statutory summary, quota summary; construction dashboards; no sales/collections analytics | Build on SQL views |
| Chart ↔ map cross-filtering | Missing | — | Build |
| Time slider replay | Missing | needs `stand_history` | After history table |
| Reports PDF + Excel (stand register, arrears, statements, sales, servicing, inspections, land use); scheduled email | Partial | statements via SMS/WhatsApp; CSV/Print on prototype tables | PDF/XLSX generation; email provider optional |

## Phase 6 — field operations (offline-first)

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Installable PWA | Missing | Tauri desktop shell exists (`src-tauri`) | Add PWA manifest + service worker |
| Offline map + stands, GPS capture, photos, sync with conflicts | Missing (prototype "offline sync" button is a stub) | — | Build |
| "Where am I", navigate to stand | Missing | — | Browser geolocation + local routing |
| QR code per stand | Missing | — | Generate locally |
| Construction progress map by stage | Partial | construction module tracks milestones per project, not per stand | Link stands to construction stages |

## Phase 7 — security, automation, AI

| Feature | Status | Where in code | What to do |
|---|---|---|---|
| Roles: Super Admin, Developer Admin, Manager, Sales, Finance, Surveyor/GIS, Inspector, Buyer, Read-only | **Partial / Conflicts** | ZHMS roles: LAND_OFFICER, FINANCE_MANAGER/CLERK, CEO, ENGINEER, AUDITOR, ADMIN, APPLICANT + construction roles | Map existing roles; add Surveyor/GIS, Sales, Inspector, Read-only, tenant admin (Q7) |
| Enforced on API and UI | Exists (API) / Partial (UI) | `requireRole`; UI hides some actions | Keep API as source of truth |
| Tenant isolation tested | Missing | no tenants | With multi-tenancy |
| 2FA, password policy | **Missing** | no login at all — tokens from an external identity provider | Decide identity approach (Q7) |
| Rate limiting, HTTPS | Exists | express-rate-limit, nginx TLS + limits | Keep |
| Encrypted backups | Missing | — | Add backup job |
| Immutable audit log incl. geometry + import source | **Partial** | hash-chained `audit_log`; imports audited with count only | Record per-stand source + geometry changes |
| Approval workflows (price change, transfer) | Partial | application approvals; CEO signs documents | Generic approvals |
| Event automation (allocation → agreement PDF; payment → arrears + map; reminders) | **Partial** | payment → status, receipt; reminders/overdue jobs; agreement is CEO-triggered | Add PDF + map refresh events |
| Local AI assistant (Ollama, read-only SQL) | Missing | — | Optional, behind flag |

## Quality requirements

| Requirement | Status | Notes |
|---|---|---|
| Responsive | Partial | React UI is desktop-first (header nav overflows on phones) |
| 50,000+ stands smooth | Missing | one GeoJSON payload per development; needs vector tiles + server filtering |
| Low bandwidth | Partial | nginx gzip; no tile caching |
| ERP works when GIS is down | Exists | map endpoints independent of payments/allocations |
| Tests: arrears, area, permissions, tenant isolation, import (KML/KMZ), topology, end-to-end reserve→allocate→pay→transfer | Partial | strong coverage of lifecycle, allocation races, instalments, permissions, GeoJSON import; nothing for KML, topology, tenants |
| Seed: Harare estate, 2 phases, ~100 stands, buyers, payments, inspections + sample KML | Partial | 3 developments, 8 stands, no buyers/payments | New seed |
| Setup script downloading OSM + DEM once | Missing | — | Build |

## Things in the app that this brief would duplicate or contradict

| Item | Conflict | Recommendation |
|---|---|---|
| Python prototype (`server.py` + `index.html`) | Re-implements stands, sales, cadastre, CRM, supply chain with in-memory data and unverified roles | Do not extend; port useful screens onto ZHMS; retire after (Q1) |
| `src/real_estate_erp` (SQLAlchemy, Prisma, schema.sql) and `spatial/schema.sql` | Fourth/fifth definition of parcels/projects/users | Do not use; delete later with your approval |
| Stand statuses in the brief | Different names/meaning from DB-enforced statuses | Present the brief's statuses as a **derived view**; keep the DB life cycle |
| Brief's 2FA / password policy | ZHMS delegates sign-in to an external identity provider | Choose a self-hosted IdP or build auth (Q7) |
| Brief's "price currency USD/ZiG" | ZHMS prices and ledger are USD-only by design | Keep unless you decide otherwise (Q5) |
| Brief's "phase servicing" | ZHMS certifies servicing per stand, and the deed gate uses it | Add phases as a roll-up; keep per-stand certification |
| Leaflet vs MapLibre | Existing map is Leaflet | Migrate the cadastre map to MapLibre in Phase 1 (Q8) |
