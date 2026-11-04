## 2025-02-14 - Hardcoded Ledger Secret Key

**Vulnerability:** Default hardcoded secret key ("enterprise_secret") was present in the initialization of the `DualCurrencyLedger` in `src/fintech/ledger.py` and `main.py`.
**Learning:** Default hardcoded secrets pose a significant risk, as they can be easily discovered and exploited by an attacker, allowing them to compromise cryptographic integrity such as forging transaction signatures.
**Prevention:** Remove hardcoded secrets from source code and load them from secure environment variables instead. Implement the "Fail Securely" pattern by throwing an exception (e.g. `ValueError`) when critical secrets are absent.
