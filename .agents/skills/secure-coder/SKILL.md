---
name: secure-coder
description: Audits source code for security vulnerabilities (OWASP Top 10), prevents credential leaks, enforces input sanitization, and refactors code using secure coding standards.
---

# Secure Coder & Application Security Skill

When performing security code reviews, vulnerability audits, refactoring, or building new endpoints and services, strictly enforce the following security controls, scanning heuristics, and remediation protocols.

---

## 1. Vulnerability Audit Checklist (OWASP Top 10 & CWE)

### 1.1 Injection Flaws (A03:2021 - Injection / CWE-89, CWE-78)
- **SQL / PostGIS Injection**:
  - Enforce parameterized queries, prepared statements, or ORM parameter bindings across all database interactions (e.g., PostgreSQL `$1, $2` or SQLite `?`).
  - Reject string formatting (`f"..."`, `+`, `format()`) in raw SQL statements.
  - For dynamic table/column identifiers, enforce strict whitelisting.
- **Command & Shell Injection**:
  - Avoid `shell=True` in Python `subprocess`, or direct shell string concatenation in `child_process.exec`.
  - Always pass argument arrays with `subprocess.run(["cmd", arg1, arg2], shell=False)`.

### 1.2 Broken Authentication & Session Management (A07:2021 - Identification & Authentication Failures)
- Enforce modern password hashing algorithms (Argon2id, bcrypt with appropriate work factor). Never use SHA256, MD5, or plain text.
- Verify JWT signature algorithms: explicitly specify `algorithms=["RS256"]` or `["HS256"]`; forbid `"none"`.
- Enforce OAuth 2.0 / Application Default Credentials (ADC) patterns without hardcoded secrets.
- Enforce session invalidation upon logout and strict expiry timeouts.

### 1.3 Sensitive Data Exposure & Credential Leaks (A02:2021 - Cryptographic Failures / CWE-798)
- **Zero Hardcoded Secrets**:
  - Detect and eliminate hardcoded API keys, JWT secrets, database connection passwords, SSH/TLS private keys, or webhook tokens.
  - Enforce retrieval from environment variables (e.g., `os.environ.get("API_KEY")`) or secret managers.
- **Logging Sanitization**:
  - Mask or redact sensitive parameters (passwords, PINs, card numbers, National IDs, tokens) before logging or returning error responses.
- **Data at Rest & in Transit**:
  - Enforce TLS 1.3/1.2 for all external communication.

### 1.4 Broken Access Control & Authorization (A01:2021 - Broken Access Control / CWE-284)
- Enforce Role-Based Access Control (RBAC) and object-level permission checks (prevent Insecure Direct Object References - IDOR).
- Verify user ownership/tenancy on every mutation and data retrieval route.

### 1.5 Security Misconfigurations & CORS (A05:2021 - Security Misconfiguration)
- Reject wildcard (`*`) CORS headers when credentials/cookies are accepted.
- Restrict debug/development endpoints and verbose stack trace outputs in production environments.
- Enforce security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.

### 1.6 Input Sanitization & Cross-Site Scripting (A03:2021 - XSS / CWE-79)
- Sanitize and escape all untrusted user input before rendering in HTML/DOM, emails, or templates.
- In Python, use `html.escape(input_str)` or templating engines with auto-escaping enabled (e.g., Jinja2).
- Validate input formats against strict schemas (e.g., Pydantic, Zod, regex validators).

---

## 2. Credential Leak Prevention Heuristics

Scan all source code, configuration files, and commit diffs against credential patterns:
- High-entropy tokens matching `[A-Za-z0-9_-]{20,}` assigned to variables containing `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `AUTH`.
- Specific provider prefixes: `sk_live_`, `ghp_`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z-_]{35}`, `-----BEGIN PRIVATE KEY-----`.
- Database URLs containing embedded credentials (e.g., `postgres://user:pass@host:5432/db`).

When a potential secret is detected:
1. Immediately flag as **CRITICAL**.
2. Replace hardcoded value with `os.environ.get("<KEY_NAME>")` or configuration injector.
3. Recommend secret rotation if committed to version control.

---

## 3. Autonomous Refactoring & Remediation Protocol

When a vulnerability or flawed code snippet is identified:
1. **Identify**: Pinpoint the exact file path and line number of the vulnerability.
2. **Classify**: Assign OWASP category, CWE ID, and severity level (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
3. **Exploit Analysis**: Explain the attack vector and demonstrate how malicious payloads exploit the flaw.
4. **Remediate**: Deliver a clean, minimal, drop-in replacement that eliminates the vulnerability while preserving complete operational functionality.
5. **Verify**: Provide automated unit tests (`pytest` or `jest`) asserting protection against exploit payloads.

---

## 4. Review Deliverables

At the completion of an audit or remediation, deliver a **Security Audit Walkthrough**:
- **Audit Summary Table**: Listing files inspected, status (PASS/FAIL), and vulnerability counts.
- **Vulnerability Findings**: Detail each vulnerability, severity, exploit scenario, and remediation rationale.
- **Unified Diff**: Clean patch showing before/after refactoring.
- **Verification Output**: Test execution results demonstrating 100% test pass rate with exploit immunity.
