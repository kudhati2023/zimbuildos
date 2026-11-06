## 2024-05-15 - Enforce Fail Securely on HMAC Secrets
**Vulnerability:** Hardcoded HMAC secrets were used as fallback values in environment variables, which can lead to cryptographic compromise if deployed without proper configuration.
**Learning:** The 'Fail Securely' security philosophy requires raising explicit errors (e.g., ValueError) when critical environment variables are missing, rather than silently falling back to hardcoded default strings.
**Prevention:** Always validate critical secrets from the environment and raise startup errors if missing. Mock secrets explicitly in tests to allow development without defaults in source.
