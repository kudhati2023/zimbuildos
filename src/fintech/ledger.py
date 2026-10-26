"""
Fintech Gateway:
Dual-Currency Double-Entry Ledger (USD / ZWG) with RBZ exchange rate conversion and cryptographic integrity.
"""
from typing import Dict, Any, List
import hmac
import hashlib
import time
import os

class DualCurrencyLedger:
    def __init__(self, secret_key: str = None):
        secret = secret_key or os.environ.get("ZIMBUILD_HMAC_SECRET")
        if not secret:
            raise ValueError("ZIMBUILD_HMAC_SECRET environment variable is missing.")
        self.secret_key = secret.encode('utf-8')
        self.accounts: Dict[str, Dict[str, Any]] = {}
        self.transactions: List[Dict[str, Any]] = []

    def record_installment(
        self,
        stand_id: str,
        amount_tendered: float,
        currency: str,
        fx_rate_zwg_per_usd: float,
        total_contract_value_usd: float
    ) -> Dict[str, Any]:
        """
        Records an installment payment in USD or ZWG, converts to USD equivalent,
        updates the ledger balance, and verifies completion.
        """
        if stand_id not in self.accounts:
            self.accounts[stand_id] = {
                "total_cost_usd": total_contract_value_usd,
                "total_paid_usd": 0.0,
                "balance_usd": total_contract_value_usd
            }

        # Calculate USD equivalent
        if currency.upper() == "USD":
            usd_equiv = round(amount_tendered, 2)
        elif currency.upper() == "ZWG":
            usd_equiv = round(amount_tendered / fx_rate_zwg_per_usd, 2)
        else:
            raise ValueError(f"Unsupported currency: {currency}")

        acct = self.accounts[stand_id]
        acct["total_paid_usd"] = round(acct["total_paid_usd"] + usd_equiv, 2)
        acct["balance_usd"] = max(0.0, round(acct["total_cost_usd"] - acct["total_paid_usd"], 2))
        is_fully_paid = acct["balance_usd"] <= 0.0

        # Sign transaction record
        tx_data = f"{stand_id}:{amount_tendered}:{currency}:{usd_equiv}:{time.time()}"
        signature = hmac.new(self.secret_key, tx_data.encode('utf-8'), hashlib.sha256).hexdigest()

        record = {
            "stand_id": stand_id,
            "currency_paid": currency.upper(),
            "amount_paid": amount_tendered,
            "fx_rate_applied": fx_rate_zwg_per_usd,
            "usd_equivalent": usd_equiv,
            "total_paid_usd": acct["total_paid_usd"],
            "remaining_balance_usd": acct["balance_usd"],
            "is_fully_paid": is_fully_paid,
            "signature": signature
        }
        self.transactions.append(record)
        return record
