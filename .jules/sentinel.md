## 2026-11-03 - Enforce 'Fail Securely' for HMAC Secrets
**Vulnerability:** Several critical modules (`security_guard.py`, `fleet_appraisal_manager.py`, `hr_payroll_manager.py`, `field_service_manager.py`) were falling back to a hardcoded string ('zimbuild-secure-erp-signing-key-2026') if `ZIMBUILD_HMAC_SECRET` was missing from the environment.
**Learning:** This fallback behavior violates the 'Fail Securely' philosophy, as missing production secrets could silently use a default key that might be exposed in source control, allowing cryptographic audits to be bypassed or forged.
**Prevention:** Always raise explicit exceptions (e.g., `ValueError`) when critical security configuration is missing, ensuring the application fails to start rather than running in an insecure default state.
