## 2026-10-15 - [Remove Hardcoded HMAC Secrets]
**Vulnerability:** Critical hardcoded fallback values for HMAC_SECRET (e.g., 'zimbuild-secure-erp-signing-key-2026') used via os.environ.get fallback parameter.
**Learning:** When critical secrets are missing from the environment, silently falling back to a hardcoded string compromises the security of cryptographic hashing operations across the application.
**Prevention:** Enforce 'Fail Securely' by strictly requiring environment variables to be present, raising ValueError (e.g., `if not _hmac_secret: raise ValueError(...)`) instead of providing default fallback values.
