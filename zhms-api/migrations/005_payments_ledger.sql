-- 005_payments_ledger.sql : payments, double-entry ledger, balances. All append-only.
CREATE SEQUENCE receipt_seq START 1;

CREATE TABLE payments (
    payment_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    allocation_id      uuid NOT NULL REFERENCES allocations(allocation_id),
    channel            text NOT NULL CHECK (channel IN ('DEBIT_ORDER','BANK_TRANSFER','ECOCASH','OMARI','CASH')),
    amount_usd         numeric(12,2) NOT NULL CHECK (amount_usd > 0),
    external_reference text NOT NULL CHECK (length(trim(external_reference)) BETWEEN 1 AND 100),
    receipt_number     text NOT NULL UNIQUE DEFAULT ('REC-' || lpad(nextval('receipt_seq')::text, 8, '0')),
    received_at        timestamptz NOT NULL,
    recorded_by        text NOT NULL,
    notes              text,
    created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    -- Idempotency: the same gateway / bank / receipt-book reference can only ever be credited once.
    CONSTRAINT uq_payment_channel_reference UNIQUE (channel, external_reference)
);
CREATE INDEX idx_payments_allocation ON payments(allocation_id, received_at);

CREATE TABLE ledger_accounts (
    code text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('ASSET','LIABILITY','REVENUE'))
);
-- Reference data (chart of accounts), not business data.
INSERT INTO ledger_accounts(code, name, type) VALUES
    ('1010', 'Bank - transfers',                  'ASSET'),
    ('1020', 'Bank - debit orders',               'ASSET'),
    ('1030', 'EcoCash clearing',                  'ASSET'),
    ('1040', 'O''mari clearing',                  'ASSET'),
    ('1050', 'Cash on hand',                      'ASSET'),
    ('2100', 'Customer stand account (deposits and instalments)', 'LIABILITY');

CREATE TABLE journal_entries (
    journal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL UNIQUE REFERENCES payments(payment_id),
    narration  text NOT NULL,
    posted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_lines (
    line_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id   uuid NOT NULL REFERENCES journal_entries(journal_id),
    account_code text NOT NULL REFERENCES ledger_accounts(code),
    debit        numeric(12,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit       numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    CHECK ((debit > 0) <> (credit > 0))
);
CREATE INDEX idx_journal_lines_journal ON journal_lines(journal_id);

-- Debits must equal credits for every journal, checked at commit.
CREATE FUNCTION assert_journal_balanced() RETURNS trigger AS $$
DECLARE d numeric; c numeric;
BEGIN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
      FROM journal_lines WHERE journal_id = NEW.journal_id;
    IF d <> c THEN
        RAISE EXCEPTION 'Journal % is unbalanced (debit %, credit %)', NEW.journal_id, d, c USING ERRCODE = 'ZH003';
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_balanced
    AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_journal_balanced();

CREATE TRIGGER trg_payments_immutable BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER trg_journal_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE VIEW allocation_balances AS
SELECT a.allocation_id,
       a.total_price_usd,
       a.deposit_required_usd,
       COALESCE(SUM(p.amount_usd), 0)                       AS paid_usd,
       a.total_price_usd - COALESCE(SUM(p.amount_usd), 0)   AS balance_usd
  FROM allocations a
  LEFT JOIN payments p ON p.allocation_id = a.allocation_id
 GROUP BY a.allocation_id;
