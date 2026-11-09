## 2026-11-09 - Hardcoded HMAC Secret in Ledger
**Vulnerability:** The `DualCurrencyLedger` class in `src/fintech/ledger.py` and `main.py` uses a hardcoded secret key (`"enterprise_secret"`) to sign transaction records using HMAC.
**Learning:** Relying on a hardcoded string as a default fallback for security-critical secrets can easily lead to production use of compromised/publicly known secrets, breaking cryptographic integrity guarantees. Fallback secrets are often neglected and accidentally pushed to production.
**Prevention:** Use environment variables for secrets (e.g., `os.environ.get('ZIMBUILD_LEDGER_SECRET')`). Never provide a fallback secret in code; instead, throw a `ValueError` if the environment variable is missing to ensure the application fails securely.
