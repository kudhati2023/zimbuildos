## 2023-10-27 - Remove Hardcoded HMAC Secret Default Value
**Vulnerability:** Several modules were using `os.environ.get("ZIMBUILD_HMAC_SECRET", "zimbuild-secure-erp-signing-key-2026")`, falling back to a hardcoded string if the environment variable was absent.
**Learning:** This violates the "Fail Securely" philosophy. If a critical cryptographic secret is missing from the environment, the application should crash immediately (e.g., raise `ValueError`) rather than silently continuing with an insecure, easily discoverable fallback key.
**Prevention:** Never provide fallback defaults for critical cryptographic secrets in `os.environ.get()`. Always fetch the variable and explicitly check for its presence, raising an exception if it is missing.
