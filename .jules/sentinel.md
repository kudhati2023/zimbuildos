## 2024-05-24 - [Remove Hardcoded Secret Fallbacks]
**Vulnerability:** Critical environment variables like `ZIMBUILD_HMAC_SECRET` had hardcoded default fallback values in `os.environ.get()` calls.
**Learning:** This violates the "Fail Securely" philosophy. If an environment is misconfigured, the application silently falls back to an insecure, known string, which an attacker could use to forge cryptographic signatures or bypass security controls.
**Prevention:** Always raise an explicit error (like `ValueError`) when critical environment variables are missing, instead of using default fallbacks. Mock these variables in `tests/conftest.py` for local testing.
