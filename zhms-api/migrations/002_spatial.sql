-- 002_spatial.sql : PostGIS geometry for stands (Arc 1950 / UTM zone 36S, EPSG:32736).
-- Requires the PostGIS extension. Production always runs this migration.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE la_spatial_unit ADD COLUMN geom geometry(Polygon, 32736);
CREATE INDEX idx_stand_geom ON la_spatial_unit USING GIST (geom);
