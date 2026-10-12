-- 008_gis_cadastre.sql : housing developments, stand boundaries for the web map, zoning and
-- non-buildable land (wetlands, way-leaves, servitudes, flood zones). Works with or without PostGIS:
-- boundary_geojson (WGS84 lon/lat) is the single source; 009_spatial_sync derives the PostGIS geom from it.

CREATE TABLE developments (
    development_id text PRIMARY KEY CHECK (development_id ~ '^[a-z0-9-]{3,60}$'),
    name           text NOT NULL UNIQUE,                 -- equals la_spatial_unit.scheme_name
    code           text NOT NULL UNIQUE,
    province       text NOT NULL,
    target_units   integer NOT NULL CHECK (target_units > 0),
    center_lat     numeric(9,6) NOT NULL CHECK (center_lat BETWEEN -23 AND -15),
    center_lng     numeric(9,6) NOT NULL CHECK (center_lng BETWEEN 25 AND 34),
    default_zoom   integer NOT NULL DEFAULT 16 CHECK (default_zoom BETWEEN 5 AND 20),
    created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE la_spatial_unit
    ADD COLUMN development_id   text REFERENCES developments(development_id),
    ADD COLUMN zoning_type      text NOT NULL DEFAULT 'SINGLE_RESIDENTIAL'
                                CHECK (zoning_type IN ('SINGLE_RESIDENTIAL','HIGH_RISE_FLAT','COMMERCIAL','MSME_WORKSPACE')),
    -- Non-buildable land. Such a stand is always WITHDRAWN, so the allocation trigger can never book it.
    ADD COLUMN land_constraint  text
                                CHECK (land_constraint IN ('WETLAND','POWER_WAYLEAVE','ROAD_SERVITUDE','FLOOD_ZONE')),
    ADD COLUMN boundary_geojson jsonb,
    ADD COLUMN center_lat       numeric(9,6),
    ADD COLUMN center_lng       numeric(9,6),
    ADD COLUMN dimensions       text,
    ADD CONSTRAINT chk_constrained_land_withdrawn CHECK (land_constraint IS NULL OR status = 'WITHDRAWN'),
    ADD CONSTRAINT chk_boundary_is_polygon CHECK (boundary_geojson IS NULL OR boundary_geojson->>'type' = 'Polygon');

CREATE INDEX idx_stand_development ON la_spatial_unit(development_id);

-- Non-buildable land carries no price; every bookable stand still must.
ALTER TABLE la_spatial_unit DROP CONSTRAINT la_spatial_unit_price_usd_check;
ALTER TABLE la_spatial_unit ADD CONSTRAINT chk_stand_price
    CHECK (price_usd > 0 OR (land_constraint IS NOT NULL AND price_usd = 0));

-- The development a stand belongs to must match its scheme name (one naming, no drift).
CREATE FUNCTION assert_stand_development() RETURNS trigger AS $$
BEGIN
    IF NEW.development_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM developments d WHERE d.development_id = NEW.development_id AND d.name = NEW.scheme_name) THEN
        RAISE EXCEPTION 'Stand % scheme_name must equal its development name', NEW.stand_number USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stand_development BEFORE INSERT OR UPDATE OF development_id, scheme_name ON la_spatial_unit
    FOR EACH ROW EXECUTE FUNCTION assert_stand_development();
