## YYYY-MM-DD - [Hardcoded Fintech Secret]
**Vulnerability:** Hardcoded `enterprise_secret` in `DualCurrencyLedger` and `main.py`
**Learning:** Hardcoded credentials allow an attacker with source code access to forge fintech transaction signatures.
**Prevention:** Always use environment variables for sensitive configuration like HMAC keys or API secrets.
