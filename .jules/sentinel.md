## 2026-10-09 - Fail Securely on Missing Secrets
**Vulnerability:** Codebase modules silently fell back to hardcoded default values for critical secrets (like HMAC_SECRET) using `os.environ.get("SECRET", "default")` when the environment variable was missing.
**Learning:** This approach causes the application to insecurely use weak, hardcoded secrets in production instead of alerting administrators that the environment is misconfigured.
**Prevention:** Follow the 'Fail Securely' philosophy by removing defaults from `os.environ.get()` and explicitly raising a `ValueError` if the critical secret is missing. Set mock environment variables early in test configs (`conftest.py`) so tests can still pass locally without requiring real secrets.
