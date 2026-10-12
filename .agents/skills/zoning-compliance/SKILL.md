---
name: zoning-compliance
description: Validates land survey DXF/CAD drawings against statutory rules including ZNHSP 40% high-rise zoning mandates, youth quotas, and 100m wetland exclusion buffers.
---

# Town Planner & Surveyor Subagent: Zoning Compliance & Statutory Rules

## 1. Domain Context & Statutory Framework
This skill enforces statutory town planning and layout compliance under:
- **Zimbabwe National Human Settlements Policy (ZNHSP, 2020)**: Section 4.3 mandates a minimum 40% land allocation for high-density multi-storey walk-up apartments (densification strategy), and a minimum 20% quota reserved for youths and vulnerable groups.
- **Regional, Town and Country Planning Act [Chapter 29:12]**: Governs layout masterplans, density restrictions, road widths, and open space reservations.
- **Environmental Management Act (EMA) [Chapter 20:27]**: Enforces a non-negotiable 100-meter exclusion buffer around all wetlands, streams, and ecologically sensitive river basins.
- **Land Survey Act [Chapter 20:12]**: Governs beacon placements, boundary closures, and tie-ins to national trigonometric beacons.

## 2. Core Validation Rules & Thresholds

| Rule ID | Parameter | Regulatory Basis | Threshold / Formula | Action on Failure |
| :--- | :--- | :--- | :--- | :--- |
| **ZC-001** | Multi-Storey Densification | ZNHSP Section 4.3 | `(HighRise_Footprint_Area / Total_Developable_Area) >= 0.40` | Fatal Rejection |
| **ZC-002** | Wetland Ecological Buffer | EMA Statutory Inst. 7 of 2007 | `Distance(Stand_Boundary, Wetland_Polygon) >= 100m` | Fatal Rejection |
| **ZC-003** | Youth Housing Quota | ZNHSP Cabinet Directive | `(Youth_Stands_Count / Total_Stands_Count) >= 0.20` | Fatal Rejection |
| **ZC-004** | Road Width Servitudes | Ministry of Transport Standards | Primary: >= 20m, Secondary: >= 15m, Access Cul-de-sac: >= 10m | Warning / Correction |
| **ZC-005** | Minimum Stand Sizes | Local Authority Bylaws | High Density >= 200m², Medium >= 400m², Low >= 1000m² | Rejection per stand |

## 3. Step-by-Step Execution Checklist

1. **Ingest Cadastral Spatial Data**:
   - Inspect incoming GeoJSON feature collections from `spatial-transformer`.
   - Separate layers: `STANDS`, `ROADS`, `WETLANDS`, `RIVER_BUFFERS`, `GREEN_SPACES`, `BUILDING_ENVELOPES`.
2. **Wetland Intersect & Buffer Analysis**:
   - Compute PostGIS `ST_Buffer(wetland_geom, 100.0)` for all environmental layers.
   - Run spatial intersection test `ST_Intersects(stand_geom, buffered_wetland)`.
   - Flag any intersecting parcel with coordinates and vertex of encroachment.
3. **Densification & Quota Verification**:
   - Aggregate cumulative land area of stands marked with zoning type `HIGH_RISE_MULTI_STOREY`.
   - Validate against total developable residential area (excluding roads and servitudes).
   - Verify `demographic_allocation` tags to ensure at least 20% of designated residential units are earmarked for youth applicants (ages 18–35).
4. **Road Hierarchy & Servitude Clearance**:
   - Verify minimum setback buffers: 5m building line from street frontage, 2m side and rear boundaries.
5. **Issue Compliance Certification**:
   - Output structured JSON audit report and annotated SVG/GeoJSON issue flags (`zoning_approval.md`).

## 4. Output Specification

Every execution must return a standardized validation payload:

```json
{
  "compliance_status": "PASSED | FAILED",
  "project_id": "ZHMS-HRE-2026-089",
  "timestamp": "2026-10-08T12:00:00Z",
  "densification": {
    "total_developable_area_m2": 150000.0,
    "high_rise_area_m2": 63000.0,
    "achieved_ratio": 0.42,
    "required_ratio": 0.40,
    "is_compliant": true
  },
  "youth_quota": {
    "total_residential_units": 450,
    "youth_designated_units": 105,
    "achieved_ratio": 0.233,
    "required_ratio": 0.20,
    "is_compliant": true
  },
  "environmental_buffers": {
    "wetland_count": 2,
    "buffer_distance_m": 100.0,
    "encroachment_violations": []
  },
  "violations": [],
  "statutory_clearance_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```
