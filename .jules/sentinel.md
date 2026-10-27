## 2024-10-10 - Enforce Fail Securely on Environment Variables
**Vulnerability:** Critical cryptographic secrets like `ZIMBUILD_HMAC_SECRET` were silently falling back to hardcoded default values (`zimbuild-secure-erp-signing-key-2026`) when missing from the environment.
**Learning:** This approach compromises security by allowing production systems to inadvertently use well-known default keys if environment variables fail to load.
**Prevention:** Always follow the "Fail Securely" philosophy: remove hardcoded fallbacks for secrets and instead raise explicit errors (e.g., `ValueError`) during initialization if critical environment variables are absent.
