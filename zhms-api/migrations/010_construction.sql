-- 010_construction.sql : construction operations.
--   * Job costing: locked budget baseline per cost code, approved adjustments, and an append-only cost
--     ledger for material issues, labour timesheets, equipment hours, subcontract certificates and overheads.
--   * Site progress: weighted milestones and one immutable daily site report per project per day.
--   * Tenders & subcontracts: sealed bids, weighted price/technical evaluation, award, variations and
--     cumulative progress claims with retention.
--   * Quality: checklist inspections; every failed item opens a non-conformance report (NCR) that blocks
--     its milestone from completing until it is resolved and independently verified.
--   * Plant: equipment register, hour meters, service intervals and maintenance / breakdown logs.
-- Error codes ZH010-ZH019 are mapped to API errors in src/errors.js.

CREATE TABLE construction_projects (
    project_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
    name                text NOT NULL CHECK (length(trim(name)) > 0),
    development_id      text REFERENCES developments(development_id),
    site_location       text NOT NULL CHECK (length(trim(site_location)) > 0),
    client_name         text NOT NULL CHECK (length(trim(client_name)) > 0),
    contract_value_usd  numeric(14,2) NOT NULL CHECK (contract_value_usd >= 0),
    start_date          date NOT NULL,
    planned_end_date    date NOT NULL,
    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CLOSED')),
    created_by          text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (planned_end_date >= start_date)
);

-- ---------------------------------------------------------------------------------------------- job costing

CREATE TABLE materials (
    material_code      text PRIMARY KEY CHECK (material_code ~ '^[A-Z0-9][A-Z0-9.\-]{1,29}$'),
    name               text NOT NULL CHECK (length(trim(name)) > 0),
    unit               text NOT NULL CHECK (length(trim(unit)) > 0),
    standard_rate_usd  numeric(14,4) NOT NULL CHECK (standard_rate_usd > 0),
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- The budget baseline is locked once set: changes go through approved budget_adjustments.
CREATE TABLE project_budget_lines (
    line_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           uuid NOT NULL REFERENCES construction_projects(project_id),
    cost_code            text NOT NULL CHECK (cost_code ~ '^[A-Z0-9][A-Z0-9.\-]{0,19}$'),
    description          text NOT NULL CHECK (length(trim(description)) > 0),
    category             text NOT NULL CHECK (category IN ('MATERIAL','LABOUR','EQUIPMENT','SUBCONTRACT','OVERHEAD')),
    original_budget_usd  numeric(14,2) NOT NULL CHECK (original_budget_usd >= 0),
    budget_quantity      numeric(14,3) CHECK (budget_quantity > 0),
    unit                 text,
    created_by           text NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_budget_cost_code UNIQUE (project_id, cost_code),
    UNIQUE (project_id, line_id),
    CHECK ((budget_quantity IS NULL) = (unit IS NULL))
);
CREATE TRIGGER trg_budget_lines_immutable BEFORE UPDATE OR DELETE ON project_budget_lines
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE budget_adjustments (
    adjustment_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid NOT NULL,
    line_id        uuid NOT NULL,
    amount_usd     numeric(14,2) NOT NULL CHECK (amount_usd <> 0),
    reason         text NOT NULL CHECK (length(trim(reason)) >= 5),
    approved_by    text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (project_id, line_id) REFERENCES project_budget_lines(project_id, line_id)
);
CREATE INDEX idx_budget_adjustments_line ON budget_adjustments(line_id);
CREATE TRIGGER trg_budget_adjustments_immutable BEFORE UPDATE OR DELETE ON budget_adjustments
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE FUNCTION assert_budget_not_negative() RETURNS trigger AS $$
DECLARE v_revised numeric;
BEGIN
    PERFORM 1 FROM project_budget_lines WHERE line_id = NEW.line_id FOR SHARE;
    SELECT l.original_budget_usd + COALESCE((SELECT sum(amount_usd) FROM budget_adjustments WHERE line_id = l.line_id), 0)
      INTO v_revised FROM project_budget_lines l WHERE l.line_id = NEW.line_id;
    IF v_revised + NEW.amount_usd < 0 THEN
        RAISE EXCEPTION 'Adjustment would make the revised budget negative (%)', v_revised + NEW.amount_usd USING ERRCODE = 'ZH013';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_budget_not_negative BEFORE INSERT ON budget_adjustments
    FOR EACH ROW EXECUTE FUNCTION assert_budget_not_negative();

-- ---------------------------------------------------------------------------------------------- plant

CREATE TABLE equipment (
    equipment_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_tag               text NOT NULL UNIQUE CHECK (asset_tag ~ '^[A-Z0-9][A-Z0-9\-/]{1,29}$'),
    name                    text NOT NULL CHECK (length(trim(name)) > 0),
    equipment_type          text NOT NULL CHECK (length(trim(equipment_type)) > 0),
    hourly_rate_usd         numeric(10,2) NOT NULL CHECK (hourly_rate_usd > 0),
    hour_meter              numeric(10,1) NOT NULL DEFAULT 0 CHECK (hour_meter >= 0),
    service_interval_hours  numeric(8,1) NOT NULL DEFAULT 250 CHECK (service_interval_hours > 0),
    last_service_hours      numeric(10,1) NOT NULL DEFAULT 0 CHECK (last_service_hours >= 0),
    status                  text NOT NULL DEFAULT 'AVAILABLE'
                            CHECK (status IN ('AVAILABLE','UNDER_MAINTENANCE','OUT_OF_SERVICE')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (last_service_hours <= hour_meter)
);

CREATE TABLE maintenance_logs (
    log_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id        uuid NOT NULL REFERENCES equipment(equipment_id),
    project_id          uuid REFERENCES construction_projects(project_id),
    maintenance_type    text NOT NULL CHECK (maintenance_type IN ('PREVENTIVE','CORRECTIVE','BREAKDOWN','INSPECTION')),
    status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED')),
    description         text NOT NULL CHECK (length(trim(description)) > 0),
    takes_out_of_use    boolean NOT NULL,
    reported_by         text NOT NULL,
    reported_at         timestamptz NOT NULL DEFAULT now(),
    work_done           text,
    hour_meter_reading  numeric(10,1),
    parts_cost_usd      numeric(12,2) CHECK (parts_cost_usd >= 0),
    labour_cost_usd     numeric(12,2) CHECK (labour_cost_usd >= 0),
    downtime_hours      numeric(10,2) CHECK (downtime_hours >= 0),
    completed_by        text,
    completed_at        timestamptz,
    CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL AND work_done IS NOT NULL))
);
CREATE UNIQUE INDEX uq_open_maintenance_per_equipment ON maintenance_logs(equipment_id) WHERE status = 'OPEN';
CREATE INDEX idx_maintenance_equipment ON maintenance_logs(equipment_id, reported_at DESC);

CREATE FUNCTION guard_maintenance_log() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'Completed maintenance records cannot be changed' USING ERRCODE = 'ZH002';
    END IF;
    IF NEW.equipment_id <> OLD.equipment_id OR NEW.maintenance_type <> OLD.maintenance_type
       OR NEW.description <> OLD.description OR NEW.reported_at <> OLD.reported_at THEN
        RAISE EXCEPTION 'Only the completion of a maintenance record can be recorded' USING ERRCODE = 'ZH002';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_maintenance BEFORE UPDATE OR DELETE ON maintenance_logs
    FOR EACH ROW EXECUTE FUNCTION guard_maintenance_log();

-- ---------------------------------------------------------------------------------------------- tenders & subcontracts

CREATE TABLE subcontractors (
    subcontractor_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  text NOT NULL CHECK (length(trim(name)) > 0),
    registration_no       text NOT NULL,
    trade                 text NOT NULL CHECK (length(trim(trade)) > 0),
    contact_phone         text NOT NULL,
    email                 text,
    tax_clearance_expiry  date,                       -- ZIMRA ITF263; bidders without a valid one are non-compliant
    user_sub              text UNIQUE,                -- links a SUBCONTRACTOR sign-in to this firm
    status                text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_subcontractor_registration UNIQUE (registration_no)
);

CREATE TABLE tenders (
    tender_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference             text NOT NULL,
    project_id            uuid NOT NULL,
    line_id               uuid NOT NULL,
    title                 text NOT NULL CHECK (length(trim(title)) > 0),
    scope                 text NOT NULL CHECK (length(trim(scope)) > 0),
    estimate_usd          numeric(14,2) NOT NULL CHECK (estimate_usd > 0),
    price_weight          integer NOT NULL DEFAULT 70 CHECK (price_weight BETWEEN 0 AND 100),
    technical_weight      integer NOT NULL DEFAULT 30 CHECK (technical_weight BETWEEN 0 AND 100),
    min_technical_score   numeric(5,2) NOT NULL DEFAULT 60 CHECK (min_technical_score BETWEEN 0 AND 100),
    closing_at            timestamptz NOT NULL,
    status                text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','EVALUATION','AWARDED','CANCELLED')),
    created_by            text NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    awarded_bid_id        uuid,
    award_justification   text,
    awarded_by            text,
    awarded_at            timestamptz,
    cancel_reason         text,
    CONSTRAINT uq_tender_reference UNIQUE (reference),
    FOREIGN KEY (project_id, line_id) REFERENCES project_budget_lines(project_id, line_id),
    CHECK (price_weight + technical_weight = 100),
    CHECK ((status = 'AWARDED') = (awarded_bid_id IS NOT NULL))
);

CREATE TABLE tender_bids (
    bid_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id         uuid NOT NULL REFERENCES tenders(tender_id),
    subcontractor_id  uuid NOT NULL REFERENCES subcontractors(subcontractor_id),
    amount_usd        numeric(14,2) NOT NULL CHECK (amount_usd > 0),
    duration_days     integer NOT NULL CHECK (duration_days > 0),
    methodology       text,
    technical_score   numeric(5,2) CHECK (technical_score BETWEEN 0 AND 100),
    scored_by         text,
    scored_at         timestamptz,
    submitted_by      text NOT NULL,
    submitted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_one_bid_per_bidder UNIQUE (tender_id, subcontractor_id)
);
ALTER TABLE tenders ADD CONSTRAINT fk_tender_awarded_bid FOREIGN KEY (awarded_bid_id) REFERENCES tender_bids(bid_id);

-- Sealed bidding: bids only while the tender is open and before it closes; prices never change;
-- only the technical score may be recorded, and only during evaluation.
CREATE FUNCTION guard_tender_bid() RETURNS trigger AS $$
DECLARE v_status text; v_closing timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Bids cannot be withdrawn once submitted' USING ERRCODE = 'ZH002';
    END IF;
    SELECT status, closing_at INTO v_status, v_closing FROM tenders WHERE tender_id = NEW.tender_id FOR SHARE;
    IF TG_OP = 'INSERT' THEN
        IF v_status <> 'OPEN' OR clock_timestamp() >= v_closing THEN
            RAISE EXCEPTION 'Tender is closed for bids' USING ERRCODE = 'ZH014';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.amount_usd <> OLD.amount_usd OR NEW.duration_days <> OLD.duration_days
       OR NEW.subcontractor_id <> OLD.subcontractor_id OR NEW.tender_id <> OLD.tender_id
       OR NEW.submitted_at <> OLD.submitted_at THEN
        RAISE EXCEPTION 'Submitted bids cannot be changed' USING ERRCODE = 'ZH002';
    END IF;
    IF v_status <> 'EVALUATION' THEN
        RAISE EXCEPTION 'Technical scores can only be recorded during evaluation' USING ERRCODE = 'ZH014';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_tender_bid BEFORE INSERT OR UPDATE OR DELETE ON tender_bids
    FOR EACH ROW EXECUTE FUNCTION guard_tender_bid();

CREATE TABLE subcontracts (
    subcontract_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_no               text NOT NULL UNIQUE,
    project_id                uuid NOT NULL,
    line_id                   uuid NOT NULL,
    subcontractor_id          uuid NOT NULL REFERENCES subcontractors(subcontractor_id),
    tender_id                 uuid UNIQUE REFERENCES tenders(tender_id),
    scope                     text NOT NULL CHECK (length(trim(scope)) > 0),
    original_value_usd        numeric(14,2) NOT NULL CHECK (original_value_usd > 0),
    retention_percent         numeric(5,2) NOT NULL DEFAULT 5 CHECK (retention_percent BETWEEN 0 AND 20),
    payment_terms_days        integer NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 120),
    defects_liability_months  integer NOT NULL DEFAULT 12 CHECK (defects_liability_months BETWEEN 0 AND 60),
    start_date                date NOT NULL,
    end_date                  date NOT NULL,
    status                    text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','TERMINATED')),
    created_by                text NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (project_id, line_id) REFERENCES project_budget_lines(project_id, line_id),
    CHECK (end_date >= start_date)
);
CREATE INDEX idx_subcontracts_project ON subcontracts(project_id);

CREATE TABLE subcontract_variations (
    variation_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subcontract_id  uuid NOT NULL REFERENCES subcontracts(subcontract_id),
    amount_usd      numeric(14,2) NOT NULL CHECK (amount_usd <> 0),
    reason          text NOT NULL CHECK (length(trim(reason)) >= 5),
    approved_by     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_variations_immutable BEFORE UPDATE OR DELETE ON subcontract_variations
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE subcontract_claims (
    claim_id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subcontract_id             uuid NOT NULL REFERENCES subcontracts(subcontract_id),
    claim_no                   integer NOT NULL CHECK (claim_no > 0),
    period_end                 date NOT NULL,
    claimed_cumulative_usd     numeric(14,2) NOT NULL CHECK (claimed_cumulative_usd > 0),
    status                     text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','CERTIFIED','REJECTED','PAID')),
    submitted_by               text NOT NULL,
    submitted_at               timestamptz NOT NULL DEFAULT now(),
    certified_cumulative_usd   numeric(14,2),
    previous_certified_usd     numeric(14,2),
    gross_this_period_usd      numeric(14,2),
    retention_this_period_usd  numeric(14,2),
    net_payable_usd            numeric(14,2),
    payment_due_date           date,
    certified_by               text,
    certified_at               timestamptz,
    rejection_reason           text,
    paid_reference             text,
    paid_by                    text,
    paid_at                    timestamptz,
    UNIQUE (subcontract_id, claim_no),
    CHECK (status IN ('SUBMITTED','REJECTED') OR (certified_cumulative_usd IS NOT NULL AND net_payable_usd IS NOT NULL)),
    CHECK (gross_this_period_usd IS NULL OR gross_this_period_usd = certified_cumulative_usd - previous_certified_usd),
    CHECK (net_payable_usd IS NULL OR net_payable_usd = gross_this_period_usd - retention_this_period_usd),
    CHECK (status <> 'PAID' OR paid_reference IS NOT NULL)
);
CREATE UNIQUE INDEX uq_one_open_claim_per_subcontract ON subcontract_claims(subcontract_id) WHERE status = 'SUBMITTED';

-- Claims never exceed the revised contract value, certificates never go backwards, and the
-- SUBMITTED -> CERTIFIED|REJECTED -> (CERTIFIED ->) PAID path is the only one allowed.
CREATE FUNCTION guard_subcontract_claim() RETURNS trigger AS $$
DECLARE v_value numeric;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Claims cannot be deleted' USING ERRCODE = 'ZH002';
    END IF;
    PERFORM 1 FROM subcontracts WHERE subcontract_id = NEW.subcontract_id FOR UPDATE;
    SELECT s.original_value_usd + COALESCE((SELECT sum(amount_usd) FROM subcontract_variations v WHERE v.subcontract_id = s.subcontract_id), 0)
      INTO v_value FROM subcontracts s WHERE s.subcontract_id = NEW.subcontract_id;
    IF NEW.claimed_cumulative_usd > v_value OR COALESCE(NEW.certified_cumulative_usd, 0) > v_value THEN
        RAISE EXCEPTION 'Cumulative claim exceeds the revised subcontract value %', v_value USING ERRCODE = 'ZH015';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NOT ((OLD.status = 'SUBMITTED' AND NEW.status IN ('CERTIFIED','REJECTED'))
             OR (OLD.status = 'CERTIFIED' AND NEW.status = 'PAID')) THEN
            RAISE EXCEPTION 'Claim cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'ZH002';
        END IF;
        IF OLD.status = 'CERTIFIED' AND (NEW.certified_cumulative_usd <> OLD.certified_cumulative_usd
             OR NEW.net_payable_usd <> OLD.net_payable_usd) THEN
            RAISE EXCEPTION 'Certified amounts cannot be changed' USING ERRCODE = 'ZH002';
        END IF;
        IF NEW.claimed_cumulative_usd <> OLD.claimed_cumulative_usd OR NEW.claim_no <> OLD.claim_no THEN
            RAISE EXCEPTION 'Submitted claim amounts cannot be changed' USING ERRCODE = 'ZH002';
        END IF;
    END IF;
    IF NEW.gross_this_period_usd < 0 THEN
        RAISE EXCEPTION 'Certified cumulative value cannot be below the previous certificate' USING ERRCODE = 'ZH015';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_subcontract_claim BEFORE INSERT OR UPDATE OR DELETE ON subcontract_claims
    FOR EACH ROW EXECUTE FUNCTION guard_subcontract_claim();

-- A variation may not cut the contract value below what has already been certified.
CREATE FUNCTION assert_variation_value() RETURNS trigger AS $$
DECLARE v_value numeric; v_certified numeric;
BEGIN
    PERFORM 1 FROM subcontracts WHERE subcontract_id = NEW.subcontract_id FOR UPDATE;
    SELECT s.original_value_usd + COALESCE((SELECT sum(amount_usd) FROM subcontract_variations v WHERE v.subcontract_id = s.subcontract_id), 0)
      INTO v_value FROM subcontracts s WHERE s.subcontract_id = NEW.subcontract_id;
    SELECT COALESCE(max(certified_cumulative_usd), 0) INTO v_certified
      FROM subcontract_claims WHERE subcontract_id = NEW.subcontract_id AND status IN ('CERTIFIED','PAID');
    IF v_value + NEW.amount_usd <= 0 OR v_value + NEW.amount_usd < v_certified THEN
        RAISE EXCEPTION 'Variation would reduce the contract below the value already certified (%)', v_certified USING ERRCODE = 'ZH015';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_variation_value BEFORE INSERT ON subcontract_variations
    FOR EACH ROW EXECUTE FUNCTION assert_variation_value();

-- ---------------------------------------------------------------------------------------------- cost ledger

CREATE TABLE cost_entries (
    entry_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid NOT NULL,
    line_id        uuid NOT NULL,
    source         text NOT NULL CHECK (source IN
                   ('MATERIAL_ISSUE','LABOUR_TIMESHEET','EQUIPMENT_USAGE','SUBCONTRACT_CERTIFICATE','OVERHEAD','REVERSAL')),
    entry_date     date NOT NULL,
    description    text NOT NULL CHECK (length(trim(description)) > 0),
    quantity       numeric(14,3) NOT NULL,
    unit           text NOT NULL,
    unit_rate_usd  numeric(14,4) NOT NULL CHECK (unit_rate_usd >= 0),
    amount_usd     numeric(14,2) NOT NULL,
    material_code  text REFERENCES materials(material_code),
    worker_ref     text,
    equipment_id   uuid REFERENCES equipment(equipment_id),
    claim_id       uuid UNIQUE REFERENCES subcontract_claims(claim_id),
    reversal_of    uuid UNIQUE REFERENCES cost_entries(entry_id),
    recorded_by    text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (project_id, line_id) REFERENCES project_budget_lines(project_id, line_id),
    CHECK (amount_usd = round(quantity * unit_rate_usd, 2)),
    CHECK ((source = 'REVERSAL') = (reversal_of IS NOT NULL)),
    CHECK (source = 'REVERSAL' OR quantity > 0),
    CHECK (source <> 'MATERIAL_ISSUE' OR material_code IS NOT NULL),
    CHECK (source <> 'LABOUR_TIMESHEET' OR worker_ref IS NOT NULL),
    CHECK (source <> 'EQUIPMENT_USAGE' OR equipment_id IS NOT NULL),
    CHECK (source <> 'SUBCONTRACT_CERTIFICATE' OR claim_id IS NOT NULL)
);
CREATE INDEX idx_cost_entries_project ON cost_entries(project_id, entry_date);
CREATE INDEX idx_cost_entries_line ON cost_entries(line_id);
CREATE TRIGGER trg_cost_entries_immutable BEFORE UPDATE OR DELETE ON cost_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Each source posts only to its own cost category; closed projects take no new cost; plant that is
-- in the workshop or out of service cannot book hours.
CREATE FUNCTION assert_cost_entry() RETURNS trigger AS $$
DECLARE v_category text; v_expected text; v_project_status text; v_equipment_status text; v_orig cost_entries%ROWTYPE;
BEGIN
    SELECT status INTO v_project_status FROM construction_projects WHERE project_id = NEW.project_id;
    IF v_project_status = 'CLOSED' THEN
        RAISE EXCEPTION 'Project is closed to new costs' USING ERRCODE = 'ZH011';
    END IF;
    SELECT category INTO v_category FROM project_budget_lines WHERE line_id = NEW.line_id;
    IF NEW.source = 'REVERSAL' THEN
        SELECT * INTO v_orig FROM cost_entries WHERE entry_id = NEW.reversal_of;
        IF v_orig.source = 'REVERSAL' OR v_orig.line_id <> NEW.line_id OR v_orig.amount_usd <> -NEW.amount_usd THEN
            RAISE EXCEPTION 'A reversal must exactly negate one original entry on the same cost line' USING ERRCODE = 'ZH010';
        END IF;
        RETURN NEW;
    END IF;
    v_expected := CASE NEW.source WHEN 'MATERIAL_ISSUE' THEN 'MATERIAL' WHEN 'LABOUR_TIMESHEET' THEN 'LABOUR'
                                  WHEN 'EQUIPMENT_USAGE' THEN 'EQUIPMENT' WHEN 'SUBCONTRACT_CERTIFICATE' THEN 'SUBCONTRACT'
                                  ELSE 'OVERHEAD' END;
    IF v_category <> v_expected THEN
        RAISE EXCEPTION '% cannot be posted to a % cost line', NEW.source, v_category USING ERRCODE = 'ZH010';
    END IF;
    IF NEW.source = 'EQUIPMENT_USAGE' THEN
        SELECT status INTO v_equipment_status FROM equipment WHERE equipment_id = NEW.equipment_id;
        IF v_equipment_status <> 'AVAILABLE' THEN
            RAISE EXCEPTION 'Equipment is % and cannot book hours', v_equipment_status USING ERRCODE = 'ZH012';
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_assert_cost_entry BEFORE INSERT ON cost_entries
    FOR EACH ROW EXECUTE FUNCTION assert_cost_entry();

-- ---------------------------------------------------------------------------------------------- site progress

CREATE TABLE project_milestones (
    milestone_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES construction_projects(project_id),
    seq               integer NOT NULL CHECK (seq > 0),
    name              text NOT NULL CHECK (length(trim(name)) > 0),
    weight_percent    numeric(5,2) NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
    planned_start     date NOT NULL,
    planned_finish    date NOT NULL,
    percent_complete  numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
    actual_start      date,
    actual_finish     date,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, seq),
    UNIQUE (project_id, milestone_id),
    CHECK (planned_finish >= planned_start),
    CHECK ((percent_complete = 100) = (actual_finish IS NOT NULL))
);

CREATE TABLE daily_site_reports (
    report_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES construction_projects(project_id),
    report_date       date NOT NULL,
    weather           text NOT NULL CHECK (weather IN ('SUNNY','CLOUDY','RAIN','HEAVY_RAIN','WINDY','STORM')),
    workers_on_site   integer NOT NULL CHECK (workers_on_site >= 0),
    work_performed    text NOT NULL CHECK (length(trim(work_performed)) > 0),
    delays            text,
    lost_hours        numeric(6,2) NOT NULL DEFAULT 0 CHECK (lost_hours >= 0),
    safety_incidents  integer NOT NULL DEFAULT 0 CHECK (safety_incidents >= 0),
    safety_notes      text,
    submitted_by      text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_daily_report_per_day UNIQUE (project_id, report_date),
    UNIQUE (project_id, report_id),
    CHECK (safety_incidents = 0 OR length(trim(COALESCE(safety_notes, ''))) > 0)
);
CREATE TRIGGER trg_daily_reports_immutable BEFORE UPDATE OR DELETE ON daily_site_reports
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE daily_progress_updates (
    report_id       uuid NOT NULL,
    project_id      uuid NOT NULL,
    milestone_id    uuid NOT NULL,
    percent_before  numeric(5,2) NOT NULL,
    percent_after   numeric(5,2) NOT NULL CHECK (percent_after BETWEEN 0 AND 100),
    note            text,
    PRIMARY KEY (report_id, milestone_id),
    FOREIGN KEY (project_id, report_id) REFERENCES daily_site_reports(project_id, report_id),
    FOREIGN KEY (project_id, milestone_id) REFERENCES project_milestones(project_id, milestone_id)
);
CREATE TRIGGER trg_progress_updates_immutable BEFORE UPDATE OR DELETE ON daily_progress_updates
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------------------------------------- quality

CREATE TABLE quality_inspections (
    inspection_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES construction_projects(project_id),
    milestone_id     uuid,
    inspection_type  text NOT NULL CHECK (inspection_type IN
                     ('SETTING_OUT','EXCAVATION','FOUNDATION','REINFORCEMENT','CONCRETE_POUR','BRICKWORK',
                      'ROOFING','PLUMBING','ELECTRICAL','FINISHES','ROADS','WATER_RETICULATION','SEWER_RETICULATION','FINAL')),
    location         text NOT NULL CHECK (length(trim(location)) > 0),
    inspected_on     date NOT NULL,
    checklist        jsonb NOT NULL CHECK (jsonb_typeof(checklist) = 'array' AND jsonb_array_length(checklist) > 0),
    result           text NOT NULL CHECK (result IN ('PASS','FAIL')),
    notes            text,
    inspector        text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (project_id, milestone_id) REFERENCES project_milestones(project_id, milestone_id)
);
CREATE INDEX idx_inspections_project ON quality_inspections(project_id, inspected_on DESC);
CREATE TRIGGER trg_inspections_immutable BEFORE UPDATE OR DELETE ON quality_inspections
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE non_conformances (
    ncr_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ncr_no             text NOT NULL UNIQUE,
    project_id         uuid NOT NULL REFERENCES construction_projects(project_id),
    milestone_id       uuid,
    inspection_id      uuid REFERENCES quality_inspections(inspection_id),
    description        text NOT NULL CHECK (length(trim(description)) > 0),
    severity           text NOT NULL CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
    status             text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','CLOSED')),
    due_date           date NOT NULL,
    raised_by          text NOT NULL,
    raised_at          timestamptz NOT NULL DEFAULT now(),
    corrective_action  text,
    resolved_by        text,
    resolved_at        timestamptz,
    verification_note  text,
    closed_by          text,
    closed_at          timestamptz,
    FOREIGN KEY (project_id, milestone_id) REFERENCES project_milestones(project_id, milestone_id),
    CHECK (status = 'OPEN' OR (corrective_action IS NOT NULL AND resolved_by IS NOT NULL)),
    CHECK (status <> 'CLOSED' OR (closed_by IS NOT NULL AND closed_by <> resolved_by))
);
CREATE INDEX idx_ncr_project ON non_conformances(project_id, status);

CREATE FUNCTION guard_non_conformance() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Closed NCRs cannot be changed' USING ERRCODE = 'ZH002';
    END IF;
    IF NEW.description <> OLD.description OR NEW.severity <> OLD.severity OR NEW.project_id <> OLD.project_id
       OR NEW.milestone_id IS DISTINCT FROM OLD.milestone_id OR NEW.ncr_no <> OLD.ncr_no THEN
        RAISE EXCEPTION 'An NCR''s finding cannot be edited' USING ERRCODE = 'ZH002';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_ncr BEFORE UPDATE OR DELETE ON non_conformances
    FOR EACH ROW EXECUTE FUNCTION guard_non_conformance();

-- Milestone weights may not exceed 100% per project; progress never goes backwards;
-- a milestone cannot reach 100% while any NCR against it is not CLOSED.
CREATE FUNCTION guard_milestone() RETURNS trigger AS $$
DECLARE v_total numeric; v_open integer;
BEGIN
    PERFORM 1 FROM construction_projects WHERE project_id = NEW.project_id FOR UPDATE;
    SELECT COALESCE(sum(weight_percent), 0) INTO v_total FROM project_milestones
     WHERE project_id = NEW.project_id AND milestone_id <> NEW.milestone_id;
    IF v_total + NEW.weight_percent > 100 THEN
        RAISE EXCEPTION 'Milestone weights would total % percent', v_total + NEW.weight_percent USING ERRCODE = 'ZH018';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.percent_complete < OLD.percent_complete THEN
        RAISE EXCEPTION 'Progress cannot go backwards (% -> %)', OLD.percent_complete, NEW.percent_complete USING ERRCODE = 'ZH017';
    END IF;
    IF NEW.percent_complete = 100 THEN
        SELECT count(*) INTO v_open FROM non_conformances WHERE milestone_id = NEW.milestone_id AND status <> 'CLOSED';
        IF v_open > 0 THEN
            RAISE EXCEPTION '% NCR(s) must be closed before this milestone can complete', v_open USING ERRCODE = 'ZH016';
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_milestone BEFORE INSERT OR UPDATE ON project_milestones
    FOR EACH ROW EXECUTE FUNCTION guard_milestone();
CREATE FUNCTION forbid_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Rows in % cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'ZH002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_milestones_no_delete BEFORE DELETE ON project_milestones
    FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER trg_projects_no_delete BEFORE DELETE ON construction_projects
    FOR EACH ROW EXECUTE FUNCTION forbid_delete();
