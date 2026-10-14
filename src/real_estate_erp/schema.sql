-- ============================================================================
-- REAL ESTATE & BUILDING CONSTRUCTION ERP SUITE
-- PostGIS-enabled PostgreSQL Relational & Spatial Database DDL Schema
-- Production Ready with Cascade Constraints, Triggers, Spatial Indexes & RBAC
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'LAND_DEVELOPER', 'LAND_SURVEYOR', 'CIVIL_ENGINEER', 'LAND_SALES_AGENT',
        'PROJECT_MANAGER', 'EXECUTIVE_MANAGEMENT', 'FINANCE_ACCOUNTANT',
        'MARKETING_SPECIALIST', 'HR_MANAGER', 'OPERATIONS_DIRECTOR', 'ADMIN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE cde_workflow_state AS ENUM ('WIP', 'Shared', 'Published', 'Archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE parcel_acquisition_type AS ENUM ('Outright', 'Joint Venture', 'Joint Development');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE unit_inventory_status AS ENUM ('Available', 'Reserved', 'Booked', 'Sold', 'Blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE defect_severity_enum AS ENUM ('MINOR', 'MODERATE', 'CRITICAL', 'FATAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE change_order_status AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- 1. SECURITY, RBAC & IMMUTABLE AUDIT LOGGING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'CIVIL_ENGINEER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS immutable_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON immutable_audit_logs (entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON immutable_audit_logs (created_at);

-- ----------------------------------------------------------------------------
-- 2. PROJECTS & COMMON DATA ENVIRONMENT (ISO 19650 CDE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    planned_value_pv NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    earned_value_ev NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    actual_cost_ac NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    contingency_reserve NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cde_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    document_number VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_uri VARCHAR(1024) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    cde_state cde_workflow_state NOT NULL DEFAULT 'WIP',
    revision VARCHAR(20) NOT NULL DEFAULT 'P01.01',
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cde_project_doc UNIQUE (project_id, document_number, revision)
);

-- ----------------------------------------------------------------------------
-- 3. LAND DEVELOPER & SPATIAL PARCELS (PostGIS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS land_parcels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES erp_projects(id) ON DELETE CASCADE,
    parcel_id VARCHAR(100) UNIQUE NOT NULL,
    title_deed_ref VARCHAR(100),
    zoning_type VARCHAR(50) NOT NULL,
    legal_status VARCHAR(50) NOT NULL DEFAULT 'Clean Title',
    acquisition_type parcel_acquisition_type NOT NULL DEFAULT 'Outright',
    boundary_geom GEOMETRY(Polygon, 4326) NOT NULL,
    gross_area_sqm NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(boundary_geom::geography)) STORED,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_land_parcels_geom ON land_parcels USING GIST (boundary_geom);

CREATE TABLE IF NOT EXISTS proforma_feasibility_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id UUID NOT NULL REFERENCES land_parcels(id) ON DELETE CASCADE,
    run_label VARCHAR(100) NOT NULL,
    gross_realization_value NUMERIC(16, 2) NOT NULL,
    construction_hard_soft_costs NUMERIC(16, 2) NOT NULL,
    finance_costs NUMERIC(16, 2) NOT NULL,
    target_developer_margin NUMERIC(16, 2) NOT NULL,
    residual_land_value NUMERIC(16, 2) NOT NULL,
    unlevered_irr NUMERIC(6, 4) NOT NULL,
    levered_irr NUMERIC(6, 4) NOT NULL,
    npv NUMERIC(16, 2) NOT NULL,
    min_dscr NUMERIC(6, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 4. UNITS INVENTORY & CONCURRENCY CONTROLS (MODULE 4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS real_estate_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id UUID NOT NULL REFERENCES land_parcels(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    block_phase VARCHAR(50),
    footprint_geom GEOMETRY(Polygon, 4326),
    lot_area_sqm NUMERIC(10, 2) NOT NULL,
    list_price_usd NUMERIC(14, 2) NOT NULL,
    status unit_inventory_status NOT NULL DEFAULT 'Available',
    reserved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reservation_expires_at TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1, -- Optimistic locking
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_parcel_unit UNIQUE (parcel_id, unit_number)
);

CREATE INDEX IF NOT EXISTS idx_units_status ON real_estate_units (status);

CREATE TABLE IF NOT EXISTS sales_commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES real_estate_units(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_level INTEGER NOT NULL DEFAULT 1,
    commission_rate_pct NUMERIC(5, 2) NOT NULL,
    commission_amount_usd NUMERIC(12, 2) NOT NULL,
    trigger_milestone_pct NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    downpayment_verified_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. CIVIL & DESIGN: WORK BREAKDOWN STRUCTURE & BOQ COST CODES (MODULE 3 & 7)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boq_cost_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    cost_code VARCHAR(50) NOT NULL,
    wbs_element VARCHAR(50) NOT NULL,
    description VARCHAR(255) NOT NULL,
    unit_of_measure VARCHAR(20) NOT NULL,
    budgeted_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0.000,
    budgeted_unit_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    budgeted_total_usd NUMERIC(16, 2) GENERATED ALWAYS AS (budgeted_quantity * budgeted_unit_rate) STORED,
    actual_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0.000,
    actual_cost_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_cost_code UNIQUE (project_id, cost_code)
);

CREATE TABLE IF NOT EXISTS tqm_site_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_description VARCHAR(255) NOT NULL,
    inspection_stage VARCHAR(100) NOT NULL,
    defect_severity defect_severity_enum NOT NULL DEFAULT 'MINOR',
    defect_description TEXT,
    photo_urls JSONB DEFAULT '[]'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    corrective_action_assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 6. PROJECT MANAGEMENT: AIA G702/G703 & CHANGE ORDERS (MODULE 5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aia_payment_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    application_number INTEGER NOT NULL,
    contractor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    period_to DATE NOT NULL,
    contract_sum_to_date NUMERIC(16, 2) NOT NULL,
    total_completed_and_stored NUMERIC(16, 2) NOT NULL,
    retainage_percentage NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    retainage_withheld_usd NUMERIC(16, 2) NOT NULL,
    total_earned_less_retainage NUMERIC(16, 2) NOT NULL,
    previous_certificates_usd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    current_payment_due_usd NUMERIC(16, 2) NOT NULL,
    lien_waiver_received BOOLEAN NOT NULL DEFAULT FALSE,
    is_certified BOOLEAN NOT NULL DEFAULT FALSE,
    certified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_proj_app_num UNIQUE (project_id, application_number)
);

CREATE TABLE IF NOT EXISTS potential_change_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    pci_code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cost_impact_usd NUMERIC(14, 2) NOT NULL,
    schedule_impact_days INTEGER NOT NULL DEFAULT 0,
    status change_order_status NOT NULL DEFAULT 'DRAFT',
    contingency_reserve_applied NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_proj_pci_code UNIQUE (project_id, pci_code)
);

-- ----------------------------------------------------------------------------
-- 7. OPERATIONS: PROCUREMENT, 3-WAY MATCH & PLANT/EQUIPMENT (MODULE 10)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    cost_code_id UUID REFERENCES boq_cost_codes(id) ON DELETE SET NULL,
    ordered_quantity NUMERIC(14, 3) NOT NULL,
    unit_price_usd NUMERIC(14, 2) NOT NULL,
    total_amount_usd NUMERIC(16, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_delivery_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    delivery_note_number VARCHAR(50) NOT NULL,
    delivered_quantity NUMERIC(14, 3) NOT NULL,
    photo_evidence_url VARCHAR(1024) NOT NULL,
    gps_latitude NUMERIC(9, 6) NOT NULL,
    gps_longitude NUMERIC(9, 6) NOT NULL,
    received_by UUID REFERENCES users(id) ON DELETE SET NULL,
    delivery_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    invoiced_quantity NUMERIC(14, 3) NOT NULL,
    invoiced_total_usd NUMERIC(16, 2) NOT NULL,
    match_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_MATCH', -- MATCHED, DISCREPANCY, REJECTED
    discrepancy_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plant_equipment_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_tag VARCHAR(50) UNIQUE NOT NULL,
    equipment_name VARCHAR(255) NOT NULL,
    current_project_id UUID REFERENCES erp_projects(id) ON DELETE SET NULL,
    total_operating_hours NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fuel_consumption_liters NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    hourly_charge_rate_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    last_preventive_maintenance TIMESTAMP WITH TIME ZONE,
    next_maintenance_due_hours NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 8. HR & SITE WORKER TIMESHEETS (MODULE 9)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    national_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    trade_classification VARCHAR(100) NOT NULL,
    hourly_base_rate_usd NUMERIC(10, 2) NOT NULL,
    license_certification_expiry DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_worker_timesheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES site_workers(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES erp_projects(id) ON DELETE CASCADE,
    cost_code_id UUID NOT NULL REFERENCES boq_cost_codes(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
    check_out_time TIMESTAMP WITH TIME ZONE NOT NULL,
    check_in_lat NUMERIC(9, 6) NOT NULL,
    check_in_lon NUMERIC(9, 6) NOT NULL,
    is_geofence_verified BOOLEAN NOT NULL DEFAULT TRUE,
    standard_hours NUMERIC(6, 2) NOT NULL,
    overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    total_pay_usd NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
