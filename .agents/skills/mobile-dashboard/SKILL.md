---
name: mobile-dashboard
description: Builds React/Vue mobile dashboards with interactive Leaflet.js map overlays and executes visual browser QA via the /browser subagent.
---

# Mobile Dashboard & Visual Browser QA Subagent

## 1. Domain Context & UX Requirements
The **Zimbabwe Housing Management System (ZHMS)** citizen-facing portal serves:
- **Local Youths & Citizens**: Accessing via budget Android devices over 3G/EDGE mobile networks.
- **Zimbabwean Diaspora**: Accessing globally to inspect stands and transact via foreign cards or EcoCash USD.

### Key Requirements
- **Performance Budget**: Initial JS bundle $\le 180\text{ KB}$ gzipped.
- **Touch-First Design**: Minimum $48 \times 48\text{ px}$ touch targets.
- **Leaflet Vector Mapping**: Real-time GeoJSON rendering with status coloring:
  - 🟢 Available General Stand
  - 🔵 Youth Reserved (ZNHSP 20% Quota)
  - 🟣 High-Rise Walk-up Flat (ZNHSP 40% Quota)
  - 🔴 Allocated / Sold

---

## 2. Step-by-Step Execution Checklist

1. **Dashboard Scaffolding**:
   - Construct mobile-responsive shell with dynamic viewport units (`100dvh`).
   - Implement live currency switcher (USD / ZWG) with RBZ interbank rate pill.
2. **Leaflet.js Cadastral Stand Overlay**:
   - Ingest GeoJSON stand features from `spatial-transformer`.
   - Implement tap/click handlers to trigger stand selection cards and bottom drawers.
3. **Mobile Payment Trigger**:
   - Wire EcoCash and Card checkout buttons in bottom drawer.
4. **Visual Browser QA via `/browser` Subagent**:
   - Emulate mobile devices (390x844 iPhone, 360x800 Android).
   - Assert map render, stand click interaction, and currency switch functionality.
   - Capture screenshot artifacts for verification.

---

## 3. Visual QA Report Schema

```json
{
  "test_run_id": "QA-ZHMS-DASH-20261008-01",
  "viewport_tested": {
    "width": 390,
    "height": 844,
    "device": "iPhone 14 / Mobile Chrome"
  },
  "qa_checks": {
    "map_tiles_loaded": true,
    "geojson_parcels_rendered": 124,
    "touch_drawer_open_passed": true,
    "currency_switch_passed": true
  },
  "status": "PASSED"
}
```
