## 2024-10-18 - Remove Hardcoded Secrets from Codebase

**Vulnerability:** ZIMBUILD_HMAC_SECRET was falling back to a hardcoded string `zimbuild-secure-erp-signing-key-2026` across multiple security modules when the environment variable was missing.

**Learning:** This violates the 'Fail Securely' philosophy. Falling back to a hardcoded string provides false assurance of security and introduces a critical vulnerability since it makes signing deterministic for external attackers across any deployment missing the env var.

**Prevention:** Ensure required secrets raise an explicit `ValueError` when absent, enforcing their configuration instead of silently resorting to defaults. Test environments should explicitly mock these environment variables inside `tests/conftest.py` prior to module loading.
