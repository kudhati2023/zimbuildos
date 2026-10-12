-- 003_applications.sql : stand applications, three-step approval, append-only history.
CREATE TABLE applications (
    application_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id         uuid NOT NULL REFERENCES la_party(subject_id),
    status             text NOT NULL CHECK (status IN (
                           'PENDING_LAND_OFFICER','PENDING_FINANCE','PENDING_CEO',
                           'APPROVED','RETURNED','RESERVED','EXPIRED','CANCELLED')),
    round              integer NOT NULL DEFAULT 1 CHECK (round >= 1),
    preferred_scheme   text,
    notes              text,
    first_submitted_at timestamptz NOT NULL DEFAULT now(),   -- queue position (first come, first served)
    last_submitted_at  timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- A person can have only one application in progress at a time.
CREATE UNIQUE INDEX uq_one_open_application_per_subject
    ON applications(subject_id)
    WHERE status IN ('PENDING_LAND_OFFICER','PENDING_FINANCE','PENDING_CEO','APPROVED','RETURNED');

CREATE INDEX idx_application_queue ON applications(first_submitted_at, application_id) WHERE status = 'APPROVED';
CREATE INDEX idx_application_status ON applications(status);

CREATE TABLE application_approvals (
    approval_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES applications(application_id),
    round          integer NOT NULL,
    role           text NOT NULL CHECK (role IN ('LAND_OFFICER','FINANCE_MANAGER','CEO')),
    decision       text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
    decided_by     text NOT NULL,
    reason         text,
    decided_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (application_id, round, role),
    CHECK (decision = 'APPROVED' OR length(trim(coalesce(reason, ''))) >= 10)   -- rejections must explain themselves
);

CREATE TABLE application_events (
    event_id       bigserial PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications(application_id),
    event_type     text NOT NULL,
    actor          text NOT NULL,
    detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_application_events_app ON application_events(application_id, event_id);

-- Shared guard used by every append-only table.
CREATE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Table % is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'ZH002';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_immutable BEFORE UPDATE OR DELETE ON application_events
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_approvals_immutable BEFORE UPDATE OR DELETE ON application_approvals
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
