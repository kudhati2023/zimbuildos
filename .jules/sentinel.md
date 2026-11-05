## 2025-02-14 - [Title] Remove hardcoded secrets and enforce secure failures
**Vulnerability:** Hardcoded fallback secrets in `DualCurrencyLedger` and `SecurityGuard` were present in the source code, allowing attackers to potentially forge or tamper with transactions if they gain access to the source code.
**Learning:** Defaulting to fallback secrets or using them conditionally (e.g. `os.environ.get("SECRET", "fallback")`) is dangerous as it silently allows the system to run in a vulnerable state without the operator's knowledge.
**Prevention:** Follow the 'Fail Securely' principle: do not use fallback secrets. Explicitly raise an error (like `ValueError`) during initialization if a required cryptographic secret is missing from the environment variables.
