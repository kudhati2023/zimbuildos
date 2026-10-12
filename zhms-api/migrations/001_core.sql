-- 001_core.sql : parties, stands (non-spatial attributes) and runtime config.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE la_party (
    subject_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub         text UNIQUE,                      -- identity-provider subject (JWT "sub"), NULL for staff-registered parties
    national_id      text NOT NULL UNIQUE,
    first_name       text NOT NULL CHECK (length(trim(first_name)) > 0),
    last_name        text NOT NULL CHECK (length(trim(last_name)) > 0),
    date_of_birth    date NOT NULL CHECK (date_of_birth < CURRENT_DATE),
    phone_number     text NOT NULL,
    email            text,
    physical_address text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE la_spatial_unit (
    parcel_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stand_number         text NOT NULL UNIQUE,
    scheme_name          text NOT NULL,
    site_location        text NOT NULL,
    area_sqm             numeric(10,2) NOT NULL CHECK (area_sqm > 0),
    price_usd            numeric(12,2) NOT NULL CHECK (price_usd > 0),
    surveyor_general_ref text,
    -- Derived from allocations by trigger (see 004). DISPUTED / WITHDRAWN are set by staff only.
    status               text NOT NULL DEFAULT 'AVAILABLE'
                         CHECK (status IN ('AVAILABLE','RESERVED','ALLOCATED','DISPUTED','WITHDRAWN')),
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stand_status ON la_spatial_unit(status);
CREATE INDEX idx_stand_scheme ON la_spatial_unit(scheme_name);

-- Business parameters that the business may change without a deploy.
CREATE TABLE app_config (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_config(key, value) VALUES
    ('deposit_percent',  '50'::jsonb),     -- deposit = 50% of the stand price
    ('reservation_days', '7'::jsonb),      -- days to pay the deposit before the stand is released
    ('min_age',          '18'::jsonb),
    ('max_age',          '50'::jsonb),
    ('priority_mode',    '"FCFS"'::jsonb); -- queue ordering; formula for score-based mode to be finalised by the business
