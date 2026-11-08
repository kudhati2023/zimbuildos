## 2023-11-09 - Hardcoded HMAC Secrets Removed
**Vulnerability:** Found hardcoded fallback value 'zimbuild-secure-erp-signing-key-2026' for ZIMBUILD_HMAC_SECRET in multiple files.
**Learning:** Default parameter values in os.environ.get() can expose production secrets if the environment variable is missing.
**Prevention:** Use os.environ.get() without fallbacks and raise an explicit ValueError if critical security secrets are not configured in the environment.
