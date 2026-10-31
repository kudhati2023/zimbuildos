## 2024-05-24 - [Enforce Fail Securely on HMAC Secrets]
**Vulnerability:** ZIMBUILD_HMAC_SECRET was retrieved using os.environ.get with a hardcoded fallback string. If the environment variable was missing, the application would silently use the hardcoded secret, leading to identical cryptographic signatures across environments and potential exposure of the signing key.
**Learning:** The "Fail Securely" philosophy requires explicit failure (e.g. raising a ValueError) when critical security environment variables are missing, rather than silently falling back to defaults.
**Prevention:** Always validate the presence of critical secrets from environment variables and raise exceptions immediately if they are missing.
