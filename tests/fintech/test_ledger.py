import pytest
import hmac
import hashlib
from unittest.mock import patch
from src.fintech.ledger import DualCurrencyLedger

def test_record_installment_usd():
    ledger = DualCurrencyLedger(secret_key="test_secret")
    record = ledger.record_installment(
        stand_id="STAND-1",
        amount_tendered=100.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )

    assert record["stand_id"] == "STAND-1"
    assert record["currency_paid"] == "USD"
    assert record["amount_paid"] == 100.0
    assert record["usd_equivalent"] == 100.0
    assert record["total_paid_usd"] == 100.0
    assert record["remaining_balance_usd"] == 900.0
    assert record["is_fully_paid"] is False

    assert ledger.accounts["STAND-1"]["total_paid_usd"] == 100.0
    assert ledger.accounts["STAND-1"]["balance_usd"] == 900.0
    assert len(ledger.transactions) == 1

def test_record_installment_zwg():
    ledger = DualCurrencyLedger()
    record = ledger.record_installment(
        stand_id="STAND-2",
        amount_tendered=2500.0,
        currency="ZWG",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )

    assert record["currency_paid"] == "ZWG"
    assert record["amount_paid"] == 2500.0
    assert record["usd_equivalent"] == 100.0

def test_record_installment_multiple():
    ledger = DualCurrencyLedger()
    ledger.record_installment(
        stand_id="STAND-3",
        amount_tendered=500.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )
    record2 = ledger.record_installment(
        stand_id="STAND-3",
        amount_tendered=12500.0,
        currency="ZWG",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )

    assert record2["total_paid_usd"] == 1000.0
    assert record2["remaining_balance_usd"] == 0.0
    assert record2["is_fully_paid"] is True
    assert len(ledger.transactions) == 2

def test_record_installment_overpayment():
    ledger = DualCurrencyLedger()
    record = ledger.record_installment(
        stand_id="STAND-4",
        amount_tendered=1500.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )

    assert record["total_paid_usd"] == 1500.0
    assert record["remaining_balance_usd"] == 0.0
    assert record["is_fully_paid"] is True

def test_record_installment_unsupported_currency():
    ledger = DualCurrencyLedger()
    with pytest.raises(ValueError, match="Unsupported currency: EUR"):
        ledger.record_installment(
            stand_id="STAND-5",
            amount_tendered=100.0,
            currency="EUR",
            fx_rate_zwg_per_usd=25.0,
            total_contract_value_usd=1000.0
        )

@patch("src.fintech.ledger.time.time")
def test_record_installment_signature(mock_time):
    mock_time.return_value = 1600000000.0
    secret = "my_secret"
    ledger = DualCurrencyLedger(secret_key=secret)
    record = ledger.record_installment(
        stand_id="STAND-6",
        amount_tendered=100.0,
        currency="USD",
        fx_rate_zwg_per_usd=25.0,
        total_contract_value_usd=1000.0
    )

    tx_data = "STAND-6:100.0:USD:100.0:1600000000.0"
    expected_signature = hmac.new(secret.encode('utf-8'), tx_data.encode('utf-8'), hashlib.sha256).hexdigest()

    assert record["signature"] == expected_signature
