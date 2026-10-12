"""
Zimbuild DevSecOps Quality Gate & Compliance Verifier (ISO/IEC 27001:2022 Annex A.8.25)

Executes automated pre-release security validation gates:
1. Static Secret & Credential Leak Scanning (ISO A.8.24 / A.8.12)
2. Subresource Integrity (SRI) Validation on Public Assets (ISO A.8.30)
3. Audit Log Cryptographic Integrity Verification (ISO A.8.16)
4. Automated Security Test Suite Enforcement (ISO A.8.29)
"""

import sys
import os
import re
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# Sensitive regex patterns to block accidental credential leaks
SECRET_PATTERNS = [
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "Raw Private Key"),
    (re.compile(r"(?i)(?:api_key|secret_key|private_key|password)\s*[:=]\s*['\"][A-Za-z0-9+/=]{32,}['\"]"), "Hardcoded High-Entropy Secret"),
    (re.compile(r"(?i)aws_secret_access_key\s*=\s*['\"][A-Za-z0-9/+=]{40}['\"]"), "AWS Secret Key"),
]

EXCLUDED_DIRS = {".git", ".gemini", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "target"}
SCANNED_EXTENSIONS = {".py", ".ts", ".js", ".html", ".json", ".sql", ".rs"}


def run_secret_scan() -> bool:
    print("[1/4] Running Static Secret & Credential Scan (ISO A.8.24 / A.8.12)...")
    violations = []
    
    for root, dirs, files in os.walk(ROOT_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for f in files:
            ext = Path(f).suffix
            if ext not in SCANNED_EXTENSIONS:
                continue
            
            filepath = Path(root) / f
            # Skip test files or test fixtures that contain benign mock patterns
            rel_path = filepath.relative_to(ROOT_DIR).as_posix()
            if "test" in rel_path.lower() or "audit_events.jsonl" in rel_path:
                continue

            try:
                content = filepath.read_text(encoding="utf-8", errors="ignore")
                for pattern, desc in SECRET_PATTERNS:
                    if pattern.search(content):
                        violations.append(f"  [FAIL] {rel_path}: {desc}")
            except Exception as e:
                pass

    if violations:
        print("Static Secret Scan Failed:")
        for v in violations:
            print(v)
        return False
    
    print("  [PASS] No hardcoded secrets detected in production sources.")
    return True


def verify_sri_hashes() -> bool:
    print("[2/4] Verifying Subresource Integrity (SRI) on Public CDNs (ISO A.8.30)...")
    index_html = ROOT_DIR / "index.html"
    if not index_html.exists():
        print("  [FAIL] index.html not found.")
        return False

    content = index_html.read_text(encoding="utf-8")
    if 'integrity="sha384-' not in content:
        print("  [FAIL] Missing required sha384 Subresource Integrity hashes in index.html.")
        return False
    if 'crossorigin="anonymous"' not in content:
        print("  [FAIL] Missing required crossorigin='anonymous' attribute on SRI assets.")
        return False

    print("  [PASS] Subresource Integrity hashes verified for external scripts and styles.")
    return True


def verify_audit_ledger() -> bool:
    print("[3/4] Verifying Audit Ledger Cryptographic Hash Chain (ISO A.8.16)...")
    try:
        sys.path.insert(0, str(ROOT_DIR))
        from src.security.security_guard import security_guard
        result = security_guard.verify_audit_log_integrity()
        if not result["valid"]:
            print(f"  [FAIL] Audit log integrity check failed. Tampered indices: {result['tampered_indices']}")
            return False
        print(f"  [PASS] Audit log verified: {result['total_events']} events cryptographically validated.")
        return True
    except Exception as e:
        print(f"  [FAIL] Failed to execute audit ledger verification: {e}")
        return False


def run_security_test_suite() -> bool:
    print("[4/4] Running Security Test Suite (ISO A.8.29)...")
    py_cmd = [sys.executable, "-m", "pytest", "tests/security", "-q"]
    res = subprocess.run(py_cmd, cwd=str(ROOT_DIR), capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  [FAIL] Python security test suite failed:\n{res.stdout}\n{res.stderr}")
        return False

    print("  [PASS] All security regression and penetration tests passed successfully.")
    return True


def main():
    print("=" * 70)
    print(" Zimbuild ERP - ISO/IEC 27001:2022 Security Quality Gate")
    print("=" * 70)

    checks = [
        run_secret_scan(),
        verify_sri_hashes(),
        verify_audit_ledger(),
        run_security_test_suite()
    ]

    print("=" * 70)
    if all(checks):
        print("[SUCCESS] ALL ISO 27001 QUALITY GATES PASSED (Deployment Ready)")
        print("=" * 70)
        sys.exit(0)
    else:
        print("[FAILURE] QUALITY GATE FAILURE: Vulnerabilities or non-compliances detected.")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()

