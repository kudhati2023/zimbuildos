## 2024-05-14 - Fix Hardcoded Secret Fallback
**Vulnerability:** The application was using `os.environ.get("ZIMBUILD_HMAC_SECRET", "zimbuild-secure-erp-signing-key-2026")` which falls back to a hardcoded plaintext secret if the environment variable is missing. This could result in cryptographic operations using a weak, widely known static key.
**Learning:** In a production environment, missing secrets must strictly fail (Fail Securely) by raising an exception, rather than silently falling back to insecure defaults.
**Prevention:** Validate that critical configuration values are actually set via environment variables. Raise an error (e.g. `ValueError`) immediately upon startup if the required secret is absent, rather than defaulting to hardcoded fallback credentials.
