# Risks and Questions

*Step 0, 2026-10-13. Ordered by severity. Nothing here has been fixed — Step 0 is read-only.*

## A. Critical

| # | Risk | Evidence | Suggested fix |
|---|---|---|---|
| R1 | **The Python ERP has no authentication.** The caller's role is read from a plain `X-User-Role` header; anyone who sends `X-User-Role: ceo` can do everything, including writes (stand sales, payroll, payments). nginx exposes it publicly at `/api/erp/`. | `server.py` `_check_rbac` (line ~310); `nginx/nginx.conf` `/api/erp/` | Do not expose it; retire it (Q1) or put it behind the ZHMS JWT |
| R2 | **Another AI agent (Antigravity) is editing the same files at the same time.** It replaced the React entry page, rewrites `index.html`, has stopped/restarted `server.py`, and runs tests against the live server. Work can be silently overwritten. | 8 commits since 2026-10-12; `index.html` changed again today (uncommitted, 394 → 512 KB); process tree showed Antigravity's `language_server` starting `server.py` | Decide who owns which files before Phase 1 (Q2) |
| R3 | **The React client cannot be opened.** `index.html` (Vite's entry page) was replaced by the prototype page, so `npm run dev` and `npm run build` serve/ship the prototype instead of the React app; production (`nginx` serves `dist/`) would ship it too. | `grep src/main.tsx index.html` → absent | Restore a minimal Vite entry page; move the prototype to e.g. `erp.html` |
| R4 | **Edits to `index.html` are lost on regeneration.** `build_full_enterprise_erp.py` regenerates `index.html` and `src/frontend/index.html` and overwrites `build_full_frontend.py` and `generate_erp_platform.py` with HTML; recent fixes exist only in `index.html`. | `build_full_enterprise_erp.py` writes those four files | Stop generating; treat the HTML as source, or retire the prototype |

## B. High

| # | Risk | Evidence | Suggested fix |
|---|---|---|---|
| R5 | **External map services in use**, contrary to the brief (Esri World Imagery is explicitly banned). | `InteractiveLeafletMap.tsx`; `index.html`; `server.py` CSP | Phase 1: local basemaps |
| R6 | **Survey coordinates are converted with a flat approximation.** The SG schedule parser treats coordinates as metres around an arbitrary origin (default lat −17.83, CM 31°) instead of a projection; real Lo 29/31 or UTM data would land hundreds of metres to kilometres off. | `gisService.parseSGCoordinateSchedule` | Use PROJ with the correct CRS (Q9) |
| R7 | **Wrong coordinate system label.** Migration 002 says "Arc 1950 / UTM 36S, EPSG:32736", but EPSG:32736 is **WGS 84** / UTM 36S; Arc 1950 / UTM 36S is EPSG:20936 (difference ≈ 100–300 m). Stored `geom` is WGS84-based, which is fine, but anyone importing Arc 1950 data on the strength of that comment would be wrong. | `zhms-api/migrations/002_spatial.sql` | Correct the comment; import Arc 1950 explicitly |
| R8 | **Synthetic infrastructure shown as real.** The utility overlay draws three fixed lines around each development centre labelled OPERATIONAL / ENERGIZED / pressure 4.5 bar. | `gisService.getUtilityInfrastructureNetwork` | Remove or replace with real service layers (Phase 3) |
| R9 | **Several stand registers that never agree** (PostgreSQL, a hard-coded array in `index.html`, Python in-memory registers, plus two unused schemas). A sale recorded in one is invisible to the others. | SYSTEM_UNDERSTANDING §6 | One register: PostgreSQL (Q1) |
| R10 | **Production configuration does not work as composed.** Python image lacks SQLAlchemy in `requirements.txt` (import fails at start); the prototype calls `/api/...` but nginx routes Python at `/api/erp/`; React CRM uses `ERP_BASE/api/crm` which doubles the `/api` prefix behind nginx; Redis is started but unused. | `requirements.txt`, `nginx.conf`, `api.ts` | Fix during Phase 0 |
| R11 | **Default secrets in `docker-compose.yml`** (database password, JWT secret, webhook secrets have committed fallback values). A deployment that forgets `.env` runs with publicly known secrets. | `docker-compose.yml` `${VAR:-default}` | Remove defaults; fail if unset |
| R12 | **Mobile-money adapters map to the wrong channels**: OneMoney (NetOne) is booked as O'mari (Old Mutual), Innbucks as BANK_TRANSFER — receipts, ledger clearing accounts and reconciliation would be wrong. | `app.js` `/webhooks/adapters/:provider` | Add proper channels + ledger accounts (Q10) |
| R13 | **Prototype buttons that report success without saving** (HR onboarding, attendance, payroll, fleet shift/fuel, appraisal, technician dispatch, field logs, work-order completion, youth registration, material dispatch, offline sync). | `index.html` handlers with `catch (e) {}` then a success alert | Retire the prototype or fix each |
| R14 | **Security log exposed**: `server.py` serves `audit_events.jsonl` (repo root) to anyone, and writes it into the repository. | static-file denylist in `server.py` | Move logs out of the web root |

## C. Medium / technical debt

| # | Item |
|---|---|
| R15 | Local development database has **no PostGIS** (PostgreSQL 18 on Windows, extension not available); migrations 002/009 have never run locally. Docker (installed) can provide PostGIS. |
| R16 | Python prototype keeps all data in memory — every restart loses it; tests write into whatever server is on port 8000 (≈ 2,800 requests observed). |
| R17 | `App.tsx` is one 2,885-line component; adding a large GIS feature set there will be hard to maintain — new GIS screens should be separate components. |
| R18 | React Supply Chain tab is a static mock-up with hard-coded figures. |
| R19 | Unused code: `src/real_estate_erp` (FastAPI, SQLAlchemy, Prisma), `spatial/schema.sql`, `zod` dependency, "Redis job queue" (never imports redis), `config/policies.py` (imports `google.antigravity`). |
| R20 | Deposit computed with floating point in `allocationService` (`totalPrice * pct / 100`) — rounding risk in an otherwise cents-exact codebase. |
| R21 | Reservation-expiry reason is hard-coded as "7-day … 50 % payment" even though both values are configurable. |
| R22 | FCFS check blocks a reservation if **any** earlier approved applicant is waiting, in any scheme — one stalled applicant blocks everyone (override needs a reason). |
| R23 | Demo data uses real-looking names of identifiable people ("Takudzwa Kunaka", "Dr. Tinashe Manzungu" — 23 occurrences in `index.html`, `server.py`, `contracts/`), and every prototype POS receipt names the same payer. The brief forbids real personal data. |
| R24 | No WebSockets/real-time; no stand geometry/price history; no tenant column; no file storage for documents. |
| R25 | Tests encode some unsafe behaviour as correct (Python API tests authenticate with `X-User-Role`), so a green suite does not mean the prototype is secure. |
| R26 | `.refact/`, `.gemini/`, `.agents/` tool state in the repo; `audit_events.jsonl` untracked in root. |

## D. Questions for you

**Q1 — Which application is "my existing app"?** I read the brief's "applicant registration, stand allocation,
instalment payment tracking" as the **ZHMS core** (`zhms-api` + React), and propose it as the only foundation. The
Python prototype would not be extended; its useful screens would be rebuilt on ZHMS and the prototype retired
later. Is that right, or is the Python ERP the product you are building?

**Q2 — Antigravity.** Should Antigravity stop working on this repository while I do the GIS phases, or should we
split ownership (e.g. it keeps the prototype, I own `zhms-api/` and `src/`)? Without this, changes will collide.

**Q3 — Reserve before or after deposit?** Today a stand is **reserved first** (held 7 days, auto-released) and the
50 % deposit is paid during the hold. The brief's "reservation hold timer" matches this. Confirm the 7 days and
50 %, and whether reservation should require approval of the application first (it does today).

**Q4 — Stand statuses.** May I keep the database life cycle and show your seven statuses as a derived view?
available = AVAILABLE · reserved = RESERVED / AWAITING_SIGNATURE · allocated = ACTIVE · paid_up = PAID_IN_FULL ·
transferred = COMPLETED (deed issued) · disputed = DISPUTED · blocked = WITHDRAWN / non-buildable.

**Q5 — Currency.** Prices and the ledger are USD; ZiG is accepted as payment at a recorded rate. Should some stands
be **priced** in ZiG, or is USD pricing + ZiG payment correct?

**Q6 — Multi-tenancy.** Do you need several developers on one installation now (adds `tenant_id` to every table and
isolation tests), or is ZimBuild the only company for the foreseeable future?

**Q7 — Sign-in.** ZHMS has no login; it expects tokens from an identity provider. For 2FA and password policy I
propose a self-hosted provider (e.g. **Keycloak**, open source, in Docker) rather than writing password handling
ourselves. Agreed? Also: how should existing roles map to the brief's (e.g. LAND_OFFICER → Surveyor/GIS + Sales?
CEO → Developer Admin?).

**Q8 — Map library.** Move the cadastre map from Leaflet to MapLibre (needed for vector tiles, 3D and 50,000+
stands)? OpenLayers would be used only for advanced editing/projection if needed.

**Q9 — Survey data.** Which coordinate systems do your surveyors deliver: Lo 29 / Lo 31 Gauss conform (Arc 1950,
Clarke 1880 — what the Surveyor-General uses), UTM 35S/36S (EPSG 20935/20936), or WGS84 GPS? Can you share one real
(non-confidential) stand diagram or coordinate list to test against?

**Q10 — Payment channels.** Should OneMoney and Innbucks be separate channels with their own clearing accounts?

**Q11 — Server.** What server will this run on (RAM, disk, OS)? Self-hosted geocoding, routing, tiles and a DEM for
Zimbabwe need roughly 8–16 GB RAM and 50–100 GB disk; offline setup downloads ~1–3 GB once.

**Q12 — Demo names.** Are "Takudzwa Kunaka" and "Dr. Tinashe Manzungu" real people? If so they should be replaced by
fictional names in demo data and receipts.

**Q13 — Prototype features you rely on.** Which prototype screens (leasing, HR/payroll, fleet, CRM, supply chain,
tax, permits, mortgage…) are actually used and must be preserved when it is retired?
