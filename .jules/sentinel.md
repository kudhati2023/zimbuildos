## 2023-11-01 - [Fail Securely: Preventing Default Secret Fallbacks]
**Vulnerability:** Critical security secrets like `ZIMBUILD_HMAC_SECRET` were falling back to a hardcoded string when the environment variable was missing.
**Learning:** This violates the "Fail Securely" principle. A missing critical security variable is a fatal state, and the application must not silently continue with a hardcoded fallback that an attacker might discover or predict.
**Prevention:** Always raise explicit exceptions (e.g., `ValueError`) when critical secrets are missing in the environment, ensuring the application cannot run in an insecure default state. For local testing, mock these variables in `conftest.py` directly.
