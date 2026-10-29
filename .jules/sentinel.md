## 2025-02-23 - [Remove hardcoded HMAC fallback secret]
**Vulnerability:** Hardcoded HMAC fallback secret used across multiple modules if `ZIMBUILD_HMAC_SECRET` is missing.
**Learning:** Silently failing back to a hardcoded string violates the "Fail Securely" philosophy, exposing sensitive transactions to potential tampering if the environment variable fails to load.
**Prevention:** Always raise an explicit error (e.g., `ValueError`) when critical secrets are missing instead of using hardcoded default fallbacks.
