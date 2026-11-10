## 2026-11-10 - Critical Security Findings
**Vulnerability:** Found hardcoded fallback secrets in python modules (e.g. `HMAC_SECRET = os.environ.get("ZIMBUILD_HMAC_SECRET", "zimbuild-secure-erp-signing-key-2026").encode()`).
**Learning:** The fallback allows the application to run with a default insecure secret if the environment variable is missing, violating the 'Fail Securely' principle.
**Prevention:** When retrieving critical security secrets, do not provide a fallback default in `os.environ.get()`. Instead, strictly enforce their presence by raising an explicit `ValueError` if missing.
