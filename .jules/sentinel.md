## 2026-11-05 - [Remove Hardcoded Secret]
**Vulnerability:** Found hardcoded fallback value 'zimbuild-secure-erp-signing-key-2026' for HMAC_SECRET if the environment variable was missing.
**Learning:** Defaulting to a hardcoded string when an environment variable is missing allows an attacker who can alter the environment to use a known cryptographic key. It violates the 'Fail Securely' principle.
**Prevention:** Always raise an exception (like ValueError) when required cryptographic secrets or API keys are missing from the environment, forcing the application to halt securely.
