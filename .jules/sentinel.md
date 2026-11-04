
## 2024-05-18 - Remove Hardcoded ZIMBUILD_HMAC_SECRET Fallback
**Vulnerability:** A hardcoded default value ("zimbuild-secure-erp-signing-key-2026") was used as a fallback for the `ZIMBUILD_HMAC_SECRET` environment variable in multiple files.
**Learning:** Hardcoded cryptographic secrets in source code present a significant risk. If an attacker gains access to the codebase, they can extract the secret and forge signatures (such as the tamper-proof payroll HMAC signatures and transaction audits in the application).
**Prevention:** Always follow the "Fail Securely" philosophy. Cryptographic secrets and API keys must be injected via environment variables. If a required secret is missing, the application should throw a `ValueError` immediately upon initialization rather than falling back to an insecure, well-known default.
