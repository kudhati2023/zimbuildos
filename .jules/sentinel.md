## 2026-10-23 - [Critical Hardcoded Secret Removal]
**Vulnerability:** The Python ERP modules (`security_guard.py`, `fleet_appraisal_manager.py`, `hr_payroll_manager.py`, `field_service_manager.py`) had a hardcoded default string `"zimbuild-secure-erp-signing-key-2026"` for `ZIMBUILD_HMAC_SECRET` when `os.environ.get()` failed to find the environment variable.
**Learning:** This violated the 'Fail Securely' principle, causing the system to silently fallback to a weak, known production secret instead of securely aborting operations.
**Prevention:** Ensured the code explicitly fails securely by raising a `ValueError` if critical secrets are missing from the environment. Also mocked these environment variables safely in `tests/conftest.py` for test runs.
