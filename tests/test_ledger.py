import pytest
import hmac
import hashlib
from src.fintech.ledger import DualCurrencyLedger

def test_record_installment_usd_initial():
    ledger = DualCurrencyLedger()
    record = ledger.record_installment(
        stand_id="STAND-001",
        amount_tendered=100.0,
        currency="USD",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    assert record["stand_id"] == "STAND-001"
    assert record["currency_paid"] == "USD"
    assert record["amount_paid"] == 100.0
    assert record["usd_equivalent"] == 100.0
    assert record["total_paid_usd"] == 100.0
    assert record["remaining_balance_usd"] == 900.0
    assert record["is_fully_paid"] is False
    assert len(ledger.transactions) == 1
    assert ledger.accounts["STAND-001"]["balance_usd"] == 900.0

def test_record_installment_zwg_initial():
    ledger = DualCurrencyLedger()
    record = ledger.record_installment(
        stand_id="STAND-002",
        amount_tendered=1350.0,
        currency="ZWG",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    assert record["stand_id"] == "STAND-002"
    assert record["currency_paid"] == "ZWG"
    assert record["amount_paid"] == 1350.0
    assert record["usd_equivalent"] == 100.0  # 1350 / 13.5
    assert record["total_paid_usd"] == 100.0
    assert record["remaining_balance_usd"] == 900.0
    assert record["is_fully_paid"] is False

def test_record_installment_multiple():
    ledger = DualCurrencyLedger()

    # First installment
    ledger.record_installment(
        stand_id="STAND-003",
        amount_tendered=500.0,
        currency="USD",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    # Second installment in ZWG
    record2 = ledger.record_installment(
        stand_id="STAND-003",
        amount_tendered=6750.0, # 500 USD equivalent
        currency="ZWG",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    assert record2["total_paid_usd"] == 1000.0
    assert record2["remaining_balance_usd"] == 0.0
    assert record2["is_fully_paid"] is True

def test_record_installment_fully_paid_overpayment():
    ledger = DualCurrencyLedger()
    record = ledger.record_installment(
        stand_id="STAND-004",
        amount_tendered=1200.0,
        currency="USD",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    assert record["total_paid_usd"] == 1200.0
    assert record["remaining_balance_usd"] == 0.0
    assert record["is_fully_paid"] is True

def test_record_installment_unsupported_currency():
    ledger = DualCurrencyLedger()

    with pytest.raises(ValueError) as excinfo:
        ledger.record_installment(
            stand_id="STAND-005",
            amount_tendered=100.0,
            currency="EUR",
            fx_rate_zwg_per_usd=13.5,
            total_contract_value_usd=1000.0
        )

    assert "Unsupported currency: EUR" in str(excinfo.value)

def test_record_installment_signature():
    secret_key = "test_secret"
    ledger = DualCurrencyLedger(secret_key=secret_key)

    record = ledger.record_installment(
        stand_id="STAND-006",
        amount_tendered=100.0,
        currency="USD",
        fx_rate_zwg_per_usd=13.5,
        total_contract_value_usd=1000.0
    )

    assert "signature" in record
    assert len(record["signature"]) == 64  # SHA256 hex digest length
