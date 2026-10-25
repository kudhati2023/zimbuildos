## 2024-10-25 - Hardcoded Fallback Secret Removal
**Vulnerability:** The application was using a hardcoded fallback secret (`zimbuild-secure-erp-signing-key-2026`) for `ZIMBUILD_HMAC_SECRET` across multiple managers when the environment variable was missing.
**Learning:** Using a fallback secret is a critical risk, as it can allow attackers to bypass signature validation if they guess or discover the default value, violating the "Fail Securely" principle.
**Prevention:** Ensure that the application raises a `ValueError` or fails immediately if critical secrets are missing from the environment, enforcing strict adherence to secure configuration.
