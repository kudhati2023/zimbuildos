-- 004_allocations.sql : stand allocations and the database-level double-allocation guarantees.
--
-- Live allocation statuses (a stand / a person is "taken"):
--   RESERVED, AWAITING_SIGNATURE, ACTIVE, PAID_IN_FULL, COMPLETED (deed issued)
-- Released statuses (stand goes back to the pool): EXPIRED, RELEASED, CANCELLED
CREATE TABLE allocations (
    allocation_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id         uuid NOT NULL UNIQUE REFERENCES applications(application_id),
    subject_id             uuid NOT NULL REFERENCES la_party(subject_id),
    parcel_id              uuid NOT NULL REFERENCES la_spatial_unit(parcel_id),
    status                 text NOT NULL CHECK (status IN (
                               'RESERVED','AWAITING_SIGNATURE','ACTIVE','PAID_IN_FULL','COMPLETED',
                               'EXPIRED','RELEASED','CANCELLED')),
    total_price_usd        numeric(12,2) NOT NULL CHECK (total_price_usd > 0),   -- snapshot at reservation time
    deposit_required_usd   numeric(12,2) NOT NULL CHECK (deposit_required_usd > 0),
    reserved_at            timestamptz NOT NULL DEFAULT now(),
    reservation_expires_at timestamptz NOT NULL,
    idempotency_key        text NOT NULL UNIQUE,
    reserved_by            text NOT NULL,
    queue_override_reason  text,
    release_reason         text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (deposit_required_usd <= total_price_usd),
    CHECK (reservation_expires_at > reserved_at)
);

-- GUARANTEE 1: a stand can have at most one live allocation.
CREATE UNIQUE INDEX uq_live_allocation_per_parcel
    ON allocations(parcel_id)
    WHERE status IN ('RESERVED','AWAITING_SIGNATURE','ACTIVE','PAID_IN_FULL','COMPLETED');

-- GUARANTEE 2: a person can hold one stand at a time (a completed deed frees the person to buy again).
CREATE UNIQUE INDEX uq_live_allocation_per_subject
    ON allocations(subject_id)
    WHERE status IN ('RESERVED','AWAITING_SIGNATURE','ACTIVE','PAID_IN_FULL');

CREATE INDEX idx_allocation_status ON allocations(status);
CREATE INDEX idx_allocation_expiry ON allocations(reservation_expires_at) WHERE status = 'RESERVED';
CREATE INDEX idx_allocation_subject ON allocations(subject_id);

-- GUARANTEE 3: even raw SQL cannot allocate a stand that is not AVAILABLE.
-- The stand row is locked, so concurrent inserts are serialised and the loser sees the new status.
CREATE FUNCTION assert_stand_available() RETURNS trigger AS $$
BEGIN
    IF NEW.status IN ('RESERVED','AWAITING_SIGNATURE','ACTIVE','PAID_IN_FULL','COMPLETED') THEN
        PERFORM 1 FROM la_spatial_unit WHERE parcel_id = NEW.parcel_id AND status = 'AVAILABLE' FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Stand % is not available', NEW.parcel_id USING ERRCODE = 'ZH001';
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_allocation_stand_available BEFORE INSERT ON allocations
    FOR EACH ROW EXECUTE FUNCTION assert_stand_available();

-- The stand's status is derived from its allocation, never set by application code.
CREATE FUNCTION sync_stand_status() RETURNS trigger AS $$
BEGIN
    UPDATE la_spatial_unit SET status = CASE
            WHEN NEW.status IN ('RESERVED','AWAITING_SIGNATURE') THEN 'RESERVED'
            WHEN NEW.status IN ('ACTIVE','PAID_IN_FULL','COMPLETED') THEN 'ALLOCATED'
            ELSE 'AVAILABLE' END
     WHERE parcel_id = NEW.parcel_id
       AND status IN ('AVAILABLE','RESERVED','ALLOCATED');   -- never overwrite DISPUTED / WITHDRAWN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_allocation_sync_insert AFTER INSERT ON allocations
    FOR EACH ROW EXECUTE FUNCTION sync_stand_status();

CREATE FUNCTION touch_and_sync_stand() RETURNS trigger AS $$
BEGIN
    UPDATE la_spatial_unit SET status = CASE
            WHEN NEW.status IN ('RESERVED','AWAITING_SIGNATURE') THEN 'RESERVED'
            WHEN NEW.status IN ('ACTIVE','PAID_IN_FULL','COMPLETED') THEN 'ALLOCATED'
            ELSE 'AVAILABLE' END
     WHERE parcel_id = NEW.parcel_id
       AND status IN ('AVAILABLE','RESERVED','ALLOCATED');
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_allocation_touch BEFORE UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_allocation_sync_update AFTER UPDATE OF status ON allocations
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION touch_and_sync_stand();

-- Allocations are never deleted and the stand / person / price they were made for never changes.
CREATE FUNCTION allocation_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Allocations cannot be deleted' USING ERRCODE = 'ZH002';
    END IF;
    IF NEW.parcel_id <> OLD.parcel_id OR NEW.subject_id <> OLD.subject_id
       OR NEW.total_price_usd <> OLD.total_price_usd OR NEW.application_id <> OLD.application_id THEN
        RAISE EXCEPTION 'Allocation stand, person and price are immutable' USING ERRCODE = 'ZH002';
    END IF;
    -- Terminal states cannot be revived (a released stand needs a brand-new allocation).
    IF OLD.status IN ('EXPIRED','RELEASED','CANCELLED','COMPLETED') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Allocation in terminal state % cannot change', OLD.status USING ERRCODE = 'ZH002';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_allocation_guard BEFORE UPDATE OR DELETE ON allocations
    FOR EACH ROW EXECUTE FUNCTION allocation_guard();
