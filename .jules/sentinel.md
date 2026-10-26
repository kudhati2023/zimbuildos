## 2024-05-18 - Failing Securely with Environment Variables
**Vulnerability:** Hardcoded API HMAC secret keys and default fallback secrets in `src/security/security_guard.py` and `src/fintech/ledger.py`.
**Learning:** Default fallback strings for cryptographic secrets mean an attacker reading the code could recreate signatures and bypass transaction integrity checks.
**Prevention:** Rely strictly on external environment variables (e.g. `os.environ.get("ZIMBUILD_HMAC_SECRET")`), and throw `ValueError` to fail securely if missing.
