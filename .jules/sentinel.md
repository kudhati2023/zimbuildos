## 2024-11-05 - 🔒 Fix hardcoded fallback HMAC secret
**Vulnerability:** Hardcoded fallback for HMAC secret.
**Learning:** The 'Fail Securely' philosophy dictates that missing critical secrets should raise a ValueError instead of silently using hardcoded fallback values.
**Prevention:** Always raise errors for missing environment variables that are critical for security instead of providing default fallback values.
