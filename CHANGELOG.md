# Changelog

## Phase 0 — make the foundation safe (2026-10-13)

Branch `phase-0-foundation`. No business logic, schema or data changes; all changes are reversible.
Decisions applied while the questions in `docs/RISKS_AND_QUESTIONS.md` are open: the ZHMS core
(`zhms-api` + React `src/`) is the foundation; the Python prototype keeps working but is not published.

### Changed
- **React client is reachable again.** `index.html` is the Vite entry (`<div id="root">` + `/src/main.tsx`);
  `npm run dev`, `npm run build` and the Tauri shell now load the React app. The prototype page moved to
  `erp.html`; `server.py` still opens it at `/`, `/index.html` and `/erp.html`.
- **The prototype generator no longer overwrites maintained files.** `build_full_enterprise_erp.py` writes only
  `erp.generated.html` (it used to overwrite `index.html`, `src/frontend/index.html` and two `.py` files).
- **Development database is PostgreSQL 16 + PostGIS 3.4 in Docker** (`docker-compose.dev.yml`, localhost:54320).
  All 10 migrations now run, including 002/009 (PostGIS geometry), which had never run locally. The previous
  Windows PostgreSQL 18 database is untouched and was backed up to `backups/` before switching.
- **The prototype ERP is no longer exposed**: nginx returns 404 for `/api/erp/`; `server.py` listens on
  127.0.0.1 unless `HOST` is set (Docker sets `HOST=0.0.0.0` and publishes to 127.0.0.1 only).
- **No committed secrets in `docker-compose.yml`**: `POSTGRES_PASSWORD`, `JWT_SECRET` and `ZIMBUILD_HMAC_SECRET`
  are required (compose refuses to start without them); webhook secrets default to empty (channel disabled).
  New `.env.example` at the root documents them.
- **Python container fixed**: `ZIMBUILD_HMAC_SECRET` is passed (it refused to start in production without it), the
  security log path uses the variable the code actually reads (`AUDIT_LOG_FILE`) and lives outside the served
  directory; `requirements.txt` gains `sqlalchemy` (import failed at start-up) and `httpx` (tests).
- **Docker build contexts**: new `.dockerignore` files keep `.env` files, database dumps, logs, `.git`,
  `node_modules` and unrelated apps out of the images (context 3 MB instead of the whole repository);
  `npm ci --omit=dev` replaces the obsolete `--only=production`; `pip` retries on slow connections.
- **Runtime logs are not downloadable**: `server.py` refuses `.jsonl`, `.log`, `.dump`, `.bak`;
  `audit_events.jsonl`, `*.log`, `backups/` and `erp.generated.html` are git-ignored.
- Migration 002 comment corrected: EPSG:32736 is WGS 84 / UTM 36S, not Arc 1950 (comment only).
- `tools/security_gate.py` checks Subresource Integrity on `erp.html` (the page that loads CDN assets).

### Fixed
- **Prototype audit chain forked under concurrent requests**, producing false "ledger tampered" alarms
  (two blocks linked to the same predecessor). Writes are now serialised with a lock
  (`src/security/security_guard.py`).

### Added — tests
- `tests/security/test_phase0_hardening.py` (8): React entry, prototype routes, generator targets, localhost
  binding, nginx not proxying the prototype, no fallback secrets, log path, logs not downloadable.
- `tests/security/test_audit_chain_concurrency.py` (1): forces concurrent writers; verified to fail without the
  fix and pass with it.

### Test results (2026-10-13)
| Suite | Result |
|---|---|
| API tests, embedded PostgreSQL (CI default) | 64 / 64 |
| API tests, PostgreSQL 16 + PostGIS 3.4 (spatial migrations included) | 64 / 64 |
| Python tests (excl. stress) incl. 9 new | all pass |
| CI security gate (`tools/security_gate.py`) | 4 / 4 gates |
| Client type-check + production build | pass; build ships the React app |
| Browser E2E, React client (12 tabs, staff token, PostGIS API) | no page errors, no API errors, 15 map polygons |
| Browser E2E, prototype page (`erp.html` via `server.py`) | 25 tabs, System Check 22/22, ledger valid |
| Docker: compose refuses missing secrets; images contain no `.env` | pass |

### Manual test steps
1. `docker compose -f docker-compose.dev.yml up -d` → `docker ps` shows `zhms-postgis-dev` healthy.
2. In `zhms-api/.env`: `DATABASE_URL=postgres://zhms:zhms_dev@localhost:54320/zhms` and `ZHMS_SPATIAL=1`.
3. `npm run server` → log shows migrations up to `010_construction.sql`; `npm run seed:api` → 8 stands.
4. `npm run dev` → open http://localhost:1420 → the **ZimBuild Housing Management System** React app (not the
   prototype). Paste a token from `npm --prefix zhms-api run issue-token -- me LAND_OFFICER,CEO` → Cadastre Map
   shows the Budiriro stands.
5. `python server.py` → open http://localhost:8000 → the prototype ERP page; http://localhost:8000/audit_events.jsonl
   → 403. From another machine on the network, port 8000 is not reachable.
6. `docker compose config` without a root `.env` → refuses with "POSTGRES_PASSWORD is required".
7. `TEST_ADMIN_URL=postgres://zhms:zhms_dev@localhost:54320/postgres npm run test:api` → 64 pass.

### Rollback
- Database: point `DATABASE_URL` back to the commented line in `zhms-api/.env` (the Windows database was not
  modified) or restore `backups/zhms-windows-pg18-*.dump` with `pg_restore`.
- Code: `git switch main` (Phase 0 lives only on `phase-0-foundation`).
