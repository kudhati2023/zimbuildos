import sys

with open("tests/conftest.py", "r") as f:
    content = f.read()

insert_code = """import os
# Mock critical environment variables before any server modules are imported
os.environ["ZIMBUILD_HMAC_SECRET"] = "test-hmac-secret-for-testing"
os.environ["ZIMBUILD_LEDGER_SECRET"] = "test-ledger-secret-for-testing"
os.environ["PAYMENT_GATEWAY_API_KEY"] = "test-pg-key-for-testing"
"""

if "os.environ[" not in content:
    lines = content.split('\n')
    # Find the first import that is from our codebase or after standard imports
    insert_idx = 0
    for i, line in enumerate(lines):
        if line.startswith("from server"):
            insert_idx = i
            break

    lines.insert(insert_idx, insert_code)

    with open("tests/conftest.py", "w") as f:
        f.write('\n'.join(lines))
    print("Updated tests/conftest.py")
else:
    print("Already updated")
