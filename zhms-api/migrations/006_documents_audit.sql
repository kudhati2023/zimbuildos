-- 006_documents_audit.sql : CEO-signed documents and the tamper-evident audit chain.
CREATE SEQUENCE agreement_seq START 1;
CREATE SEQUENCE deed_seq START 1;

CREATE TABLE issued_documents (
    document_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id      uuid NOT NULL REFERENCES allocations(allocation_id),
    doc_type           text NOT NULL CHECK (doc_type IN ('AGREEMENT_OF_SALE','DEED')),
    document_number    text NOT NULL UNIQUE,
    signed_by          text NOT NULL,
    signed_at          timestamptz NOT NULL DEFAULT now(),
    content            jsonb NOT NULL,        -- exact content that was signed
    content_hash       text NOT NULL,         -- sha256 of the canonical content
    verification_token text NOT NULL UNIQUE,
    UNIQUE (allocation_id, doc_type)
);
CREATE TRIGGER trg_documents_immutable BEFORE UPDATE OR DELETE ON issued_documents
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE audit_log (
    block_id   bigserial PRIMARY KEY,
    prev_hash  text NOT NULL,
    hash       text NOT NULL,
    actor      text NOT NULL,
    action     text NOT NULL,
    entity     text NOT NULL,
    entity_id  text NOT NULL,
    data       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL
);
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Hash input is built identically here and in verify_audit_chain().
CREATE FUNCTION audit_hash_input(p_prev text, p_actor text, p_action text, p_entity text,
                                 p_entity_id text, p_data jsonb, p_ts timestamptz) RETURNS text AS $$
    SELECT p_prev || '|' || p_actor || '|' || p_action || '|' || p_entity || '|' || p_entity_id || '|'
        || p_data::text || '|' || extract(epoch FROM p_ts)::text
$$ LANGUAGE sql IMMUTABLE;

-- Appends one block. A transaction-level advisory lock serialises writers so the chain never forks.
-- Callers must invoke this LAST in a transaction so lock ordering stays consistent (no deadlocks).
CREATE FUNCTION append_audit(p_actor text, p_action text, p_entity text, p_entity_id text, p_data jsonb)
RETURNS bigint AS $$
DECLARE v_prev text; v_ts timestamptz := clock_timestamp(); v_id bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(727001);
    SELECT hash INTO v_prev FROM audit_log ORDER BY block_id DESC LIMIT 1;
    v_prev := COALESCE(v_prev, repeat('0', 64));
    INSERT INTO audit_log(prev_hash, hash, actor, action, entity, entity_id, data, created_at)
    VALUES (v_prev,
            encode(digest(audit_hash_input(v_prev, p_actor, p_action, p_entity, p_entity_id, p_data, v_ts), 'sha256'), 'hex'),
            p_actor, p_action, p_entity, p_entity_id, p_data, v_ts)
    RETURNING block_id INTO v_id;
    RETURN v_id;
END $$ LANGUAGE plpgsql;

-- Returns NULL when the whole chain is intact, otherwise the first corrupted block_id.
CREATE FUNCTION verify_audit_chain() RETURNS bigint AS $$
DECLARE r record; v_prev text := repeat('0', 64);
BEGIN
    FOR r IN SELECT * FROM audit_log ORDER BY block_id LOOP
        IF r.prev_hash <> v_prev THEN RETURN r.block_id; END IF;
        IF r.hash <> encode(digest(audit_hash_input(r.prev_hash, r.actor, r.action, r.entity, r.entity_id, r.data, r.created_at), 'sha256'), 'hex') THEN
            RETURN r.block_id;
        END IF;
        v_prev := r.hash;
    END LOOP;
    RETURN NULL;
END $$ LANGUAGE plpgsql;
