
## 2024-11-04 - Enforce Fail Securely Principle for HMAC Secrets
**Vulnerability:** The `ZIMBUILD_HMAC_SECRET` had a hardcoded fallback string in `src/erp/field_service_manager.py` which could be exploited if the environment variable was missing.
**Learning:** Security-critical secrets must never use a hardcoded default string in fallback functions like `os.environ.get()`. If the environment variable fails to load, the system must loudly fail rather than silently default to a known value.
**Prevention:** Implement strict assertions when reading required secrets. For example, check `if "ZIMBUILD_HMAC_SECRET" not in os.environ:` and raise a `ValueError`, ensuring the application fails to start rather than running insecurely.
