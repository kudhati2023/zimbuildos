---
name: spatial-transformer
description: Executes PyPROJ/GDAL coordinate transformations from Gauss Lo projections to WGS84 GeoJSON layers and integrates with PostGIS via MCP.
---

# Spatial Transformer: Cadastral Survey & Geodetic GIS Engine

## 1. Domain Context & Geodetic Architecture

Zimbabwe's cadastral surveying legal framework (**Land Survey Act [Chapter 20:12]**) is anchored on the **Gauss Conform (Transverse Mercator)** projection based on the **Arc 1950** datum (Clarke 1880 Modified ellipsoid). Modern GIS clients, web dashboards, and mobile applications require **WGS84 (EPSG:4326)** coordinates and **Web Mercator (EPSG:3857)** vector tiles.

### 1.1 The South African & Zimbabwean Survey Convention
Cadastral field notes and General Plans (SG diagrams) issued by the Department of the Surveyor-General use the South African coordinate notation:
- **Central Meridians (Lo Belts)**: Odd meridians covering Zimbabwe: **Lo 27°E**, **Lo 29°E**, **Lo 31°E**, and **Lo 33°E**.
- **Axes Convention**:
  - `Y-axis`: Measured perpendicular to the central meridian (Westings positive west, Eastings negative east in classical notes; or inverted Cartesian).
  - `X-axis`: Measured along the central meridian (Southings positive south of the Equator).
- **Cartesian Inversion**: Standard GIS libraries (GDAL, PROJ) expect `(Easting, Northing)` where north and east are positive:
  - Northing = -X
  - Easting = -Y (if classical west-positive)

### 1.2 Geodetic Parameters & EPSG Definitions
- **Arc 1950 / Lo 29°E**: EPSG:20931
- **Arc 1950 / Lo 31°E**: EPSG:20935 (Harare / Mashonaland belt)
- **Target WGS84 2D**: EPSG:4326 (`[longitude, latitude]`)
- **Target Web Mercator**: EPSG:3857 (Spherical Mercator for Leaflet / Mapbox)

---

## 2. PostGIS MCP Integration & Spatial Schema

When executing through the **PostGIS MCP Server**, use the standardized `cadastral_stands` table:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cadastral_stands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stand_number VARCHAR(64) NOT NULL,
    block_id VARCHAR(32),
    township_name VARCHAR(128) NOT NULL,
    survey_diagram_no VARCHAR(64) NOT NULL,
    source_datum VARCHAR(32) DEFAULT 'ARC1950_LO31',
    geom_wgs84 GEOMETRY(MultiPolygon, 4326) NOT NULL,
    geom_mercator GEOMETRY(MultiPolygon, 3857) GENERATED ALWAYS AS (ST_Transform(geom_wgs84, 3857)) STORED,
    area_sqm NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom_wgs84::geography)) STORED,
    is_topologically_valid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_stand_per_township UNIQUE (stand_number, township_name)
);

CREATE INDEX IF NOT EXISTS idx_cadastral_stands_geom ON cadastral_stands USING GIST(geom_wgs84);
```

---

## 3. Step-by-Step Execution Checklist

1. **Header & Datum Identification**:
   - Extract Central Meridian ($Lo$) from CAD drawing or SG diagram (defaulting to 31°E for Harare, 29°E for Bulawayo).
2. **Coordinate Polarity & Normalization**:
   - Invert Southings: Northing = `-X`. Convert Westings: Easting = `-Y`.
3. **Transformation via PyPROJ / GDAL**:
   - Apply Zimbabwean 7-parameter Helmert transformation: `+towgs84=-143,-90,-294,0,0,0,0`.
   - Enforce coordinate precision of **7 decimal places** (~1.11 cm ground resolution).
4. **PostGIS MCP Validation & Topology Cleaning**:
   - Execute `ST_MakeValid()` and `ST_SnapToGrid(geom, 0.00001)`.
   - Validate polygon closure (`ST_IsClosed = TRUE`) and non-overlap (`ST_Overlaps = FALSE`).
5. **GeoJSON Layer Generation**:
   - Emit RFC 7946 GeoJSON FeatureCollection with stand metadata and beacon points to `spatial/site_boundaries.geojson`.

---

## 4. Output Specification

```json
{
  "transformation_status": "SUCCESS",
  "datum_applied": {
    "source_crs": "Arc 1950 / Gauss Lo 31°E",
    "target_crs": "WGS84 (EPSG:4326)",
    "helmert_parameters": { "dx": -143.0, "dy": -90.0, "dz": -294.0 }
  },
  "cadastral_metrics": {
    "vertex_count": 5,
    "calculated_area_sqm": 450.25,
    "perimeter_m": 86.40,
    "closure_error_mm": 1.4
  },
  "geojson": {
    "type": "Feature",
    "id": "STAND-4092-BUDIRIRO",
    "properties": {
      "stand_number": "4092",
      "township": "Budiriro Phase 4",
      "diagram_no": "SG-1882/2026",
      "zoning": "HIGH_DENSITY_RESIDENTIAL"
    },
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [31.0541201, -17.8261092],
          [31.0543205, -17.8261105],
          [31.0543190, -17.8262899],
          [31.0541180, -17.8262880],
          [31.0541201, -17.8261092]
        ]
      ]
    }
  }
}
```
