## 2025-02-14 - Remove Hardcoded HMAC Secret Defaults
**Vulnerability:** A hardcoded default signing key (`zimbuild-secure-erp-signing-key-2026`) was present in `os.environ.get()` calls across multiple ERP modules (`security_guard.py`, `fleet_appraisal_manager.py`, `hr_payroll_manager.py`, `field_service_manager.py`).
**Learning:** Hardcoded fallback values for secrets undermine the security of environment-based configuration, as they silently take over if the deployment environment is misconfigured or a variable is accidentally omitted.
**Prevention:** Follow the 'Fail Securely' philosophy by explicitely raising an error (e.g., `ValueError`) when a critical environment variable is missing, preventing the system from running with insecure default credentials.
