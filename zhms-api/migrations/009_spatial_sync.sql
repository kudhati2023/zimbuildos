-- 009_spatial_sync.sql : keeps the PostGIS geometry (UTM 36S, from 002_spatial) derived from the
-- WGS84 boundary_geojson, so there is exactly one place where a stand boundary is edited.
-- Skipped together with 002 when PostGIS is unavailable (file name contains "spatial").

CREATE FUNCTION sync_stand_geom() RETURNS trigger AS $$
BEGIN
    NEW.geom := CASE WHEN NEW.boundary_geojson IS NULL THEN NULL
                     ELSE ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(NEW.boundary_geojson::text), 4326), 32736) END;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stand_geom BEFORE INSERT OR UPDATE OF boundary_geojson ON la_spatial_unit
    FOR EACH ROW EXECUTE FUNCTION sync_stand_geom();

UPDATE la_spatial_unit SET boundary_geojson = boundary_geojson WHERE boundary_geojson IS NOT NULL;
