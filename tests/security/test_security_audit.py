import html
import os
import sqlite3
import pytest

# ==============================================================================
# INTENTIONALLY FLAWED CODE SAMPLES (PRE-AUDIT / PRE-REFACTORING)
# ==============================================================================

# 1. SQL Injection Defense (CWE-89 / OWASP A03:2021)
# Secured: Using parameterized queries with SQLite placeholders (?) instead of string interpolation.
def query_beneficiary_records(conn: sqlite3.Connection, beneficiary_id: str):
    cursor = conn.cursor()
    query = "SELECT id, full_name, national_id FROM beneficiaries WHERE id = ?"
    cursor.execute(query, (beneficiary_id,))
    return cursor.fetchall()


# 2. Cross-Site Scripting (XSS) Defense (CWE-79 / OWASP A03:2021)
# Secured: HTML entity escaping user input via html.escape.
def render_beneficiary_badge(applicant_name: str) -> str:
    escaped_applicant_name = html.escape(applicant_name)
    return f"<span class='badge user-applicant'>{escaped_applicant_name}</span>"


# 3. Dynamic Credential Retrieval (CWE-798 / OWASP A07:2021)
# Secured: Dynamic loading from environment variables without hardcoded production keys.
def get_payment_gateway_client(api_key: str = None) -> dict:
    effective_key = api_key or os.environ.get("PAYMENT_GATEWAY_API_KEY")
    return {
        "status": "connected",
        "api_key": effective_key
    }


# ==============================================================================
# SECURITY TEST SUITE (EXPLOIT PAYLOAD VERIFICATION)
# ==============================================================================

@pytest.fixture
def test_db():
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE beneficiaries (id TEXT PRIMARY KEY, full_name TEXT, national_id TEXT)")
    cursor.execute("INSERT INTO beneficiaries VALUES ('BEN-001', 'Tinashe Moyo', '63-1234567-B-42')")
    cursor.execute("INSERT INTO beneficiaries VALUES ('BEN-002', 'Chipo Ndlovu', '08-7654321-K-19')")
    conn.commit()
    yield conn
    conn.close()


def test_sql_injection_defense(test_db):
    """
    Exploit Payload: ' OR '1'='1
    In a vulnerable query, this payload bypasses ID matching and leaks all table records.
    In a secure, parameterized query, the search targets the literal string, returning 0 records.
    """
    exploit_payload = "BEN-001' OR '1'='1"
    results = query_beneficiary_records(test_db, exploit_payload)
    
    # Secure expectation: Must not leak all records or execute injected OR condition
    assert len(results) == 0, f"SQL Injection succeeded! Leaked {len(results)} records with payload: {exploit_payload}"
    
    # Legitimate lookup must still work
    legit_results = query_beneficiary_records(test_db, "BEN-001")
    assert len(legit_results) == 1
    assert legit_results[0][1] == "Tinashe Moyo"


def test_xss_sanitization():
    """
    Exploit Payload: <script>alert('XSS_ATTACK')</script>
    In a vulnerable function, raw script tags are reflected into HTML.
    In a secure function, special HTML characters must be escaped (&lt;, &gt;, etc.).
    """
    malicious_input = "<script>alert('XSS_ATTACK')</script>"
    rendered_output = render_beneficiary_badge(malicious_input)
    
    # Secure expectation: No raw script tags or unescaped HTML angle brackets
    assert "<script>" not in rendered_output, "XSS Vulnerability: Raw <script> tag detected in rendered HTML!"
    assert "</script>" not in rendered_output, "XSS Vulnerability: Raw </script> tag detected in rendered HTML!"
    assert "&lt;script&gt;" in rendered_output, "Input was not properly HTML entity-escaped!"


def test_hardcoded_secret_prevention(monkeypatch):
    """
    Credential Security Rule:
    1. No sensitive API key pattern ('sk_live_...') must be hardcoded in module or function defaults.
    2. The client must securely load credentials from environment variables.
    """
    import inspect
    import tests.security.test_security_audit as audit_module

    # Check for hardcoded secret string in source code
    module_source = inspect.getsource(audit_module).split("# SECURITY TEST SUITE")[0]
    assert "sk_live_" not in module_source, "Hardcoded production API key found in source code!"

    # Ensure dynamic environment variable loading works securely
    monkeypatch.setenv("PAYMENT_GATEWAY_API_KEY", "env_secret_test_key_123")
    client = get_payment_gateway_client()
    assert client["api_key"] == "env_secret_test_key_123"
    assert client["status"] == "connected"
