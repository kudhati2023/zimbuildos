-- 007_instalments_messaging.sql : quota categories, servicing gate, instalment plans, ZiG payments,
-- payment inbox (signed webhooks + buyer proof of payment) and the outbound SMS/WhatsApp queue.

CREATE TABLE quota_categories (code text PRIMARY KEY);
INSERT INTO quota_categories(code) VALUES
    ('GENERAL'), ('YOUTH'), ('WOMEN'), ('DISABILITY'), ('VETERAN'), ('PUBLIC_SERVANT');

-- ---------------------------------------------------------------- applicants
ALTER TABLE applications
    ADD COLUMN quota_category       text NOT NULL DEFAULT 'GENERAL' REFERENCES quota_categories(code),
    ADD COLUMN registration_channel text NOT NULL DEFAULT 'WEB' CHECK (registration_channel IN ('WEB','MOBILE','STAFF'));

ALTER TABLE la_party
    ADD COLUMN preferred_channel text NOT NULL DEFAULT 'WHATSAPP' CHECK (preferred_channel IN ('SMS','WHATSAPP'));

INSERT INTO app_config(key, value) VALUES
    ('youth_max_age',               '35'::jsonb),
    ('instalment_term_months',      '12'::jsonb),
    ('instalment_monthly_rate_bps', '0'::jsonb),    -- 125 = 1.25% per month on the reducing balance
    ('instalment_grace_days',       '7'::jsonb),    -- days after the due date before an instalment is OVERDUE
    ('reminder_days_before',        '3'::jsonb),
    ('fx_max_age_hours',            '72'::jsonb);   -- ZiG payments are refused if the latest rate is older

-- ---------------------------------------------------------------- stands: quota reservation + servicing
ALTER TABLE la_spatial_unit
    ADD COLUMN quota_category            text NOT NULL DEFAULT 'GENERAL' REFERENCES quota_categories(code),
    ADD COLUMN water_status              text NOT NULL DEFAULT 'PENDING' CHECK (water_status IN ('PENDING','IN_PROGRESS','CERTIFIED')),
    ADD COLUMN sewer_status              text NOT NULL DEFAULT 'PENDING' CHECK (sewer_status IN ('PENDING','IN_PROGRESS','CERTIFIED')),
    ADD COLUMN roads_status              text NOT NULL DEFAULT 'PENDING' CHECK (roads_status IN ('PENDING','IN_PROGRESS','CERTIFIED')),
    ADD COLUMN servicing_certificate_ref text,
    ADD COLUMN servicing_certified_by    text,
    ADD COLUMN servicing_certified_at    timestamptz;

-- ---------------------------------------------------------------- allocations: payer reference
-- The short reference buyers quote on EcoCash / bank transfers so payments match automatically.
ALTER TABLE allocations
    ADD COLUMN account_ref text NOT NULL DEFAULT ('ZB-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)));
CREATE UNIQUE INDEX uq_allocation_account_ref ON allocations(account_ref);

-- GUARANTEE: a deed can only be issued for a fully paid allocation on a 100% serviced stand,
-- even if application code is bypassed.
CREATE FUNCTION assert_title_gate() RETURNS trigger AS $$
DECLARE a record;
BEGIN
    IF NEW.doc_type <> 'DEED' THEN RETURN NEW; END IF;
    SELECT al.status, s.water_status, s.sewer_status, s.roads_status INTO a
      FROM allocations al JOIN la_spatial_unit s ON s.parcel_id = al.parcel_id
     WHERE al.allocation_id = NEW.allocation_id;
    IF a.status IS DISTINCT FROM 'PAID_IN_FULL' THEN
        RAISE EXCEPTION 'Deed blocked: allocation is % (must be PAID_IN_FULL)', a.status USING ERRCODE = 'ZH004';
    END IF;
    IF a.water_status <> 'CERTIFIED' OR a.sewer_status <> 'CERTIFIED' OR a.roads_status <> 'CERTIFIED' THEN
        RAISE EXCEPTION 'Deed blocked: stand servicing not certified (water %, sewer %, roads %)',
            a.water_status, a.sewer_status, a.roads_status USING ERRCODE = 'ZH005';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_title_gate BEFORE INSERT ON issued_documents
    FOR EACH ROW EXECUTE FUNCTION assert_title_gate();

-- ---------------------------------------------------------------- ZiG exchange rates (append-only)
CREATE TABLE fx_rates (
    rate_id       bigserial PRIMARY KEY,
    currency      text NOT NULL CHECK (currency = 'ZWG'),
    units_per_usd numeric(18,6) NOT NULL CHECK (units_per_usd > 0),
    source        text NOT NULL CHECK (length(trim(source)) > 0),
    recorded_by   text NOT NULL,
    effective_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fx_rates_latest ON fx_rates(currency, effective_at DESC, rate_id DESC);
CREATE TRIGGER trg_fx_rates_immutable BEFORE UPDATE OR DELETE ON fx_rates
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Payments keep the ledger in USD; ZiG payments also record what was paid and the rate applied.
ALTER TABLE payments
    ADD COLUMN currency        text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','ZWG')),
    ADD COLUMN amount_original numeric(14,2),
    ADD COLUMN fx_rate         numeric(18,6),
    ADD CONSTRAINT chk_payment_fx CHECK (
        (currency = 'USD' AND fx_rate IS NULL AND amount_original IS NULL)
     OR (currency = 'ZWG' AND fx_rate > 0 AND amount_original > 0));

-- ---------------------------------------------------------------- instalment plans
-- Created when the Agreement of Sale is signed: the balance still owed is split into monthly instalments.
CREATE TABLE payment_plans (
    plan_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id         uuid NOT NULL UNIQUE REFERENCES allocations(allocation_id),
    financed_usd          numeric(12,2) NOT NULL CHECK (financed_usd > 0),
    term_months           integer NOT NULL CHECK (term_months BETWEEN 1 AND 120),
    monthly_rate_bps      integer NOT NULL CHECK (monthly_rate_bps BETWEEN 0 AND 1000),
    interest_free_months  integer NOT NULL DEFAULT 0 CHECK (interest_free_months >= 0),
    grace_days            integer NOT NULL CHECK (grace_days BETWEEN 0 AND 60),
    start_date            date NOT NULL,
    effective_annual_rate numeric(10,6) NOT NULL,   -- true cost, disclosed to the buyer
    created_by            text NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (interest_free_months <= term_months)
);
CREATE TRIGGER trg_payment_plans_immutable BEFORE UPDATE OR DELETE ON payment_plans
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE plan_installments (
    installment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id        uuid NOT NULL REFERENCES payment_plans(plan_id),
    seq            integer NOT NULL CHECK (seq >= 1),
    due_date       date NOT NULL,
    principal_usd  numeric(12,2) NOT NULL CHECK (principal_usd >= 0),
    interest_usd   numeric(12,2) NOT NULL CHECK (interest_usd >= 0),
    paid_usd       numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_usd >= 0),
    status         text NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE','PARTIAL','PAID','OVERDUE')),
    paid_at        timestamptz,
    UNIQUE (plan_id, seq),
    CHECK (paid_usd <= principal_usd + interest_usd)
);
CREATE INDEX idx_installments_open ON plan_installments(due_date) WHERE status <> 'PAID';

-- Which payment settled which instalment (append-only).
CREATE TABLE installment_settlements (
    payment_id     uuid NOT NULL REFERENCES payments(payment_id),
    installment_id uuid NOT NULL REFERENCES plan_installments(installment_id),
    amount_usd     numeric(12,2) NOT NULL CHECK (amount_usd > 0),
    PRIMARY KEY (payment_id, installment_id)
);
CREATE TRIGGER trg_settlements_immutable BEFORE UPDATE OR DELETE ON installment_settlements
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- payment inbox
-- Every inbound notification (gateway webhook or buyer proof of payment) lands here first.
-- Matched ones become payments immediately; anything doubtful waits for finance review.
CREATE TABLE payment_inbox (
    inbox_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source             text NOT NULL CHECK (source IN ('WEBHOOK','BUYER_POP')),
    channel            text NOT NULL CHECK (channel IN ('DEBIT_ORDER','BANK_TRANSFER','ECOCASH','OMARI','CASH')),
    external_reference text NOT NULL CHECK (length(trim(external_reference)) BETWEEN 1 AND 100),
    account_ref        text,
    allocation_id      uuid REFERENCES allocations(allocation_id),
    currency           text NOT NULL CHECK (currency IN ('USD','ZWG')),
    amount             numeric(14,2) NOT NULL CHECK (amount > 0),
    payer_phone        text,
    paid_at            timestamptz,
    submitted_by       text NOT NULL,
    status             text NOT NULL CHECK (status IN ('APPLIED','PENDING_REVIEW','REJECTED')),
    review_reason      text,
    payment_id         uuid REFERENCES payments(payment_id),
    raw                jsonb NOT NULL DEFAULT '{}'::jsonb,
    received_at        timestamptz NOT NULL DEFAULT now(),
    resolved_by        text,
    resolved_at        timestamptz,
    CONSTRAINT uq_inbox_channel_reference UNIQUE (channel, external_reference),
    CHECK (status <> 'APPLIED' OR payment_id IS NOT NULL)
);
CREATE INDEX idx_inbox_status ON payment_inbox(status, received_at);

-- ---------------------------------------------------------------- outbound SMS / WhatsApp
CREATE TABLE outbound_messages (
    message_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id      uuid REFERENCES la_party(subject_id),
    to_phone        text NOT NULL,
    channel         text NOT NULL CHECK (channel IN ('SMS','WHATSAPP')),
    template        text NOT NULL,
    params          jsonb NOT NULL,
    body            text NOT NULL,
    dedupe_key      text UNIQUE,   -- the same receipt / reminder / statement is never queued twice
    status          text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','SENT','FAILED')),
    attempts        integer NOT NULL DEFAULT 0,
    last_error      text,
    provider_ref    text,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    claimed_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz
);
CREATE INDEX idx_outbound_queue ON outbound_messages(next_attempt_at) WHERE status = 'QUEUED';
