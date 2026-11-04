
## 2024-11-04 - 🔒 Security Fix: Hardcoded Secret Removal in Ledger
**Vulnerability:** Default string "enterprise_secret" was used for `secret_key` in `DualCurrencyLedger`.
**Learning:** Hardcoding secrets exposes critical systems to attacks and fails to adhere to secure-by-default practices.
**Prevention:** Load secrets exclusively from environment variables and fail securely by raising a `ValueError` if they are missing.
