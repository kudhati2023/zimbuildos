-- 002_spatial.sql : PostGIS geometry for stands in EPSG:32736 = WGS 84 / UTM zone 36S (metres).
-- NOTE: this is NOT Arc 1950. Arc 1950 / UTM 36S is EPSG:20936 (35S is 20935) and differs by roughly
-- 100-300 m; survey data in Arc 1950 or the Lo 29/31 Gauss conform system must be transformed explicitly.
-- (Comment corrected in Phase 0; the geometry definition is unchanged.)
-- Requires the PostGIS extension. Production always runs this migration.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE la_spatial_unit ADD COLUMN geom geometry(Polygon, 32736);
CREATE INDEX idx_stand_geom ON la_spatial_unit USING GIST (geom);
