# ZimBuild Housing Management System (ZHMS)

**Stand allocation, instalment payments, buyer messaging and GIS cadastre**

ZHMS runs ZimBuild's residential developments end to end: youth and quota-based applications,
a three-step approval queue, double-allocation-proof stand reservation, deposits and monthly
instalments (USD and ZiG, EcoCash and bank), SMS/WhatsApp receipts, reminders and statements,
servicing certification, and CEO-signed Agreements of Sale and Title Deeds.

There is **one backend** (`zhms-api/`) and **one client** (`src/`). Every screen reads and writes
the same PostgreSQL database through the same API client; there is no offline/mock data — if the
server refuses or is unreachable, the UI says so.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Desktop / web client (React + Vite, Tauri)          src/    │
│  api.ts  — the only HTTP client (no fallbacks)               │
│  types.ts — shared types mirroring zhms-api responses        │
│  Map (Leaflet) · Applications · Reserve · Payments ·         │
│  Statements · Owner portal                                   │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS + JWT  (/api/v1, port 5000)
┌──────────────────────────────▼───────────────────────────────┐
│  zhms-api (Express, Node 20+)                     zhms-api/  │
│  applications · allocations · payments + ledger · payment    │
│  inbox & signed webhooks · instalment plans · ZiG FX ·       │
│  messaging outbox & dispatcher · scheduled jobs · GIS        │
│  cadastre & GeoJSON import · documents · audit chain         │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  PostgreSQL (+ PostGIS in production)   zhms-api/migrations  │
│  001 core · 002 spatial · 003 applications · 004 allocations │
│  005 payments ledger · 006 documents & audit ·               │
│  007 instalments, ZiG, inbox, messaging, servicing gate ·    │
│  008 developments & GIS cadastre · 009 PostGIS sync          │
└──────────────────────────────────────────────────────────────┘
```

## Rules enforced by the database (not just the UI)

| Rule | Where |
|---|---|
| One live allocation per stand and per person — 50 parallel attempts on one stand give exactly 1 success | `004` unique indexes + `assert_stand_available` |
| Wetlands, way-leaves, servitudes and flood zones can never be booked | `008` `chk_constrained_land_withdrawn` |
| Quota-reserved stands (e.g. youth, ≤ 35 years) only go to that quota | `allocationService` + `applicationService` |
| Every payment posts a balanced double-entry journal; payments are immutable | `005` |
| A payment reference can only be credited once (webhook retries are harmless) | `005`, `007` unique constraints |
| Title deed only when fully paid **and** water, sewer and roads are certified | `007` `trg_title_gate` |
| Instalment plans, settlements, FX rates, documents and the audit log are append-only | `003`–`007` triggers |

## Roles

`APPLICANT` (any signed-in user) · `LAND_OFFICER` · `FINANCE_MANAGER` · `FINANCE_CLERK` · `CEO` ·
`ENGINEER` (certifies servicing) · `AUDITOR` · `ADMIN`. A role grants only its own actions.

---

## Quick start

```bash
# 1. Tests (real embedded PostgreSQL, nothing to install)
npm run test:api

# 2. API — needs PostgreSQL; see zhms-api/.env.example for every setting
cd zhms-api
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/zhms"
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
npm start                      # applies migrations on start-up
npm run seed                   # demo developments and mapped stands (safe to re-run)

# 3. Access tokens (zhms-api trusts tokens from your identity provider; this script signs one for testing
#    with the same JWT_SECRET)
npm run issue-token -- staff_1 LAND_OFFICER,FINANCE_MANAGER,CEO,ENGINEER

# 4. Client
cd .. && npm run dev           # http://localhost:1420 — paste the token into the header sign-in box
```

The client talks to `http://localhost:5000/api/v1` by default; set `VITE_API_BASE` to point a
build at another server. Without PostGIS, start the API with `ZHMS_SPATIAL=0` (stand boundaries are
still stored and mapped as GeoJSON; only the PostGIS geometry column is skipped).

## Payments and messaging

- Buyers pay with the **payment reference** they receive when a stand is reserved (e.g. `ZB-1A2B3C4D`).
- EcoCash / bank / O'mari notifications arrive at `POST /api/v1/webhooks/payments/{channel}`, signed
  with a per-channel secret; the payload format is documented in `zhms-api/.env.example`.
  A small adapter per provider is still needed once merchant agreements are in place.
- Anything that cannot be applied automatically (unknown reference, missing ZiG rate) and buyer
  proof-of-payment uploads wait in the finance **payment inbox**.
- Receipts, reminders, overdue notices, monthly statements and document notices are queued with the
  transaction and sent by the dispatcher. Until WhatsApp Business / SMS gateway credentials are
  configured they are written to the server log, not delivered.

## Construction operations

The **Construction Ops** tab (`src/components/construction/`) runs on `/api/v1/construction`
(`zhms-api/src/constructionRoutes.js`, migration `010_construction.sql`):

| Module | What it does | Rules enforced by the database |
|---|---|---|
| Job costing | Cost codes with a locked budget baseline and approved adjustments; material issues, labour timesheets, plant hours, overheads and subcontract certificates post to an append-only ledger; report with budget vs actual vs commitments, quantity variance and earned value (CPI/SPI/EAC) | Each source posts only to its own cost category; amount = quantity × rate; corrections are reversals; closed projects take no cost; budgets never go negative |
| Site progress | Weighted milestones, one immutable daily site report per day (weather, workforce, delays, safety), planned-vs-actual S-curve | Weights ≤ 100%; progress never goes backwards |
| Tenders & subcontracts | Sealed bids, weighted price/technical evaluation with tax-clearance compliance, justified award, variations, cumulative progress claims with retention, certification and payment | Bids only before closing and never edited; claims never exceed the revised contract value; certificates never go backwards |
| Quality control | Checklist inspections; each failed item opens an NCR due by severity; resolve → independent verification → close | A milestone cannot reach 100% while it has an unclosed NCR; the resolver cannot close it |
| Plant & maintenance | Equipment register, hour meters, service intervals, breakdown/maintenance jobs, downtime and availability | Plant in the workshop or out of service cannot book hours |

Roles: `PROJECT_MANAGER`, `QUANTITY_SURVEYOR`, `SITE_SUPERVISOR`, `QA_INSPECTOR`, `PLANT_MANAGER`, and
`SUBCONTRACTOR` (external firms: open tenders, own bids, own subcontracts and claims). `CEO`,
`FINANCE_MANAGER` (pays certified claims), `ENGINEER` and `AUDITOR` can read. Construction roles do not
see buyers' personal or payment data. Demo data: `npm run seed:construction`.
