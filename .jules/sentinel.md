## 2024-05-15 - Remove Hardcoded Cryptographic Secrets
**Vulnerability:** Critical cryptographic secrets (`ZIMBUILD_HMAC_SECRET`) were using fallback hardcoded values in `os.environ.get()` calls if the environment variable was missing.
**Learning:** This violates the "Fail Securely" philosophy. If the environment is misconfigured, the application silently fell back to a default, insecure, hardcoded string.
**Prevention:** Always raise explicit exceptions (e.g., `ValueError`) when critical secrets are missing in the environment, rather than providing fallback default strings.
