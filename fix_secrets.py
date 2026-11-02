import os

files = [
    "src/security/security_guard.py",
    "src/erp/fleet_appraisal_manager.py",
    "src/erp/hr_payroll_manager.py",
    "src/erp/field_service_manager.py"
]

for file_path in files:
    with open(file_path, "r") as f:
        content = f.read()

    old_code = 'HMAC_SECRET = os.environ.get("ZIMBUILD_HMAC_SECRET", "zimbuild-secure-erp-signing-key-2026").encode()'
    new_code = '''hmac_secret_env = os.environ.get("ZIMBUILD_HMAC_SECRET")
if not hmac_secret_env:
    raise ValueError("ZIMBUILD_HMAC_SECRET environment variable is missing")
HMAC_SECRET = hmac_secret_env.encode()'''

    if old_code in content:
        content = content.replace(old_code, new_code)
        with open(file_path, "w") as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"Skipped {file_path} (already updated or code not found)")
