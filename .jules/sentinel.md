## 2025-02-20 - Enforcing Missing Secret Validation
**Vulnerability:** Several modules, including `security_guard.py` and `ledger.py`, used weak hardcoded fallback secrets (`zimbuild-secure-erp-signing-key-2026` or `enterprise_secret`) if `ZIMBUILD_HMAC_SECRET` was omitted from the environment.
**Learning:** Hardcoded fallback values break the "Fail Securely" philosophy, allowing unauthorized attackers to forge cryptographic signatures if a deployment script accidentally omits the secret environment variable.
**Prevention:** Always raise an immediate exception (e.g., `ValueError`) when critical security configuration is missing rather than relying on default weak values. Test suites should explicitly inject mock secrets prior to module initialization.
