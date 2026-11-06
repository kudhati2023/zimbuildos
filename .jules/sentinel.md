## 2024-05-18 - Enforce Fail Securely Principle for Secrets
**Vulnerability:** Missing critical environment variables (like HMAC_SECRET) silently fell back to hardcoded default strings using `os.environ.get("ZIMBUILD_HMAC_SECRET", "default")`.
**Learning:** Hardcoded default secrets represent a critical risk if a deployment forgets to set an environment variable, leaving the system silently vulnerable with known keys.
**Prevention:** Always raise an explicit `ValueError` when critical secrets are missing rather than using default fallbacks, enforcing the "Fail Securely" philosophy.
