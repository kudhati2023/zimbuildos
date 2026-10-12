import pytest
from src.fintech.ledger import DualCurrencyLedger


def test_record_installment_usd():
    ledger = DualCurrencyLedger(secret_key="test_secret")

    # Record first installment
    tx1 = ledger.record_installment(
        stand_id="STAND-001",
        amount_tendered=2000.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=10000.0
    )

    assert tx1["stand_id"] == "STAND-001"
    assert tx1["currency_paid"] == "USD"
    assert tx1["amount_paid"] == 2000.0
    assert tx1["usd_equivalent"] == 2000.0
    assert tx1["total_paid_usd"] == 2000.0
    assert tx1["remaining_balance_usd"] == 8000.0
    assert tx1["is_fully_paid"] is False
    assert tx1["signature"] is not None


def test_record_installment_zwg():
    ledger = DualCurrencyLedger(secret_key="test_secret")

    # Record installment in ZWG (e.g., $1000 equivalent at 25.0 rate = 25000 ZWG)
    tx1 = ledger.record_installment(
        stand_id="STAND-002",
        amount_tendered=25000.0,
        currency="ZWG",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=5000.0
    )

    assert tx1["stand_id"] == "STAND-002"
    assert tx1["currency_paid"] == "ZWG"
    assert tx1["amount_paid"] == 25000.0
    assert tx1["usd_equivalent"] == 1000.0
    assert tx1["total_paid_usd"] == 1000.0
    assert tx1["remaining_balance_usd"] == 4000.0
    assert tx1["is_fully_paid"] is False


def test_record_installment_fully_paid():
    ledger = DualCurrencyLedger(secret_key="test_secret")

    # Pay 9000 USD
    ledger.record_installment(
        stand_id="STAND-003",
        amount_tendered=9000.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=10000.0
    )

    # Pay remaining 1000 USD equivalent in ZWG (25000 ZWG)
    tx2 = ledger.record_installment(
        stand_id="STAND-003",
        amount_tendered=25000.0,
        currency="ZWG",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=10000.0
    )

    assert tx2["total_paid_usd"] == 10000.0
    assert tx2["remaining_balance_usd"] == 0.0
    assert tx2["is_fully_paid"] is True


def test_record_installment_unsupported_currency():
    ledger = DualCurrencyLedger(secret_key="test_secret")

    with pytest.raises(ValueError, match="Unsupported currency: EUR"):
        ledger.record_installment(
            stand_id="STAND-004",
            amount_tendered=1000.0,
            currency="EUR",
            fx_rate_zwg_per_usd=25.0,
            total_contract_value_usd=10000.0
        )
