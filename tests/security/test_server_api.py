"""
Integration tests for Secure ERP Server API endpoints & RBAC enforcement
"""

import urllib.request
import urllib.error
import json
import pytest

import threading
import time
import socket
import socketserver

BASE_URL = "http://127.0.0.1:8000"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

@pytest.fixture(scope="session", autouse=True)
def run_test_server():
    if not is_port_in_use(8000):
        from server import SecureERPRequestHandler, PORT
        server = socketserver.TCPServer(("", 8000), SecureERPRequestHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        time.sleep(1)
        yield
        server.shutdown()
    else:
        yield

def test_api_health_endpoint():
    req = urllib.request.Request(f"{BASE_URL}/api/health")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["status"] == "HEALTHY"


def test_api_portfolio_allowed_for_ceo():
    req = urllib.request.Request(
        f"{BASE_URL}/api/portfolio",
        headers={"X-User-Role": "ceo"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["total_assets"] >= 3
        assert data["portfolio_occupancy_rate_pct"] > 0


def test_api_portfolio_blocked_for_buyer():
    req = urllib.request.Request(
        f"{BASE_URL}/api/portfolio",
        headers={"X-User-Role": "buyer"}
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req)
    assert exc_info.value.code == 403
    err_body = json.loads(exc_info.value.read().decode())
    assert err_body["security_status"] == "BLOCKED_BY_RBAC_POLICY"


def test_api_tenant_screening_endpoint():
    payload = json.dumps({
        "full_name": "Test Company Ltd",
        "income_usd": 15000.0,
        "rent_usd": 2500.0
    }).encode("utf-8")
    
    req = urllib.request.Request(
        f"{BASE_URL}/api/tenant/screen",
        data=payload,
        headers={"Content-Type": "application/json", "X-User-Role": "leasecrm"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["credit_status"] == "Approved"
        assert "hmac_signature" in data
        assert len(data["hmac_signature"]) == 64


def test_api_dlap_verify_and_caveat():
    # 0. Ensure clean state on server via API
    clear_payload = json.dumps({
        "deed_number": "TD-4982/2021",
        "action": "CLEAR"
    }).encode("utf-8")
    clear_req = urllib.request.Request(
        f"{BASE_URL}/api/dlap/caveat",
        data=clear_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "dlap"}
    )
    with urllib.request.urlopen(clear_req) as resp:
        assert resp.status == 200

    # 1. Verify deed
    payload = json.dumps({"deed_number": "TD-4982/2021"}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/dlap/verify",
        data=payload,
        headers={"Content-Type": "application/json", "X-User-Role": "dlap"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["can_transfer_or_finance"] is True

    # 2. Register Caveat
    cav_payload = json.dumps({
        "deed_number": "TD-4982/2021",
        "action": "REGISTER",
        "caveator": "Standard Chartered Bank",
        "legal_cause": "High Court Mortgage Freeze"
    }).encode("utf-8")
    cav_req = urllib.request.Request(
        f"{BASE_URL}/api/dlap/caveat",
        data=cav_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "dlap"}
    )
    with urllib.request.urlopen(cav_req) as resp:
        assert resp.status == 200
        cav_data = json.loads(resp.read().decode())
        assert cav_data["validation_status"] == "ELECTRONIC CAVEAT ACTIVE"

    # 3. Clear Caveat to restore state
    clear_payload = json.dumps({
        "deed_number": "TD-4982/2021",
        "action": "CLEAR"
    }).encode("utf-8")
    clear_req = urllib.request.Request(
        f"{BASE_URL}/api/dlap/caveat",
        data=clear_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "dlap"}
    )
    with urllib.request.urlopen(clear_req) as resp:
        assert resp.status == 200
        clear_data = json.loads(resp.read().decode())
        assert clear_data["validation_status"] == "VALIDATED"


def test_api_crm_pipeline_rbac_and_data():
    # 1. Allowed for sales role
    req = urllib.request.Request(
        f"{BASE_URL}/api/crm/pipeline",
        headers={"X-User-Role": "sales"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["total_deals_count"] >= 5
        assert data["total_pipeline_value_usd"] > 0
        assert "1_INQUIRY_CAPTURED" in data["stages"]

    # 2. Blocked for buyer role
    blocked_req = urllib.request.Request(
        f"{BASE_URL}/api/crm/pipeline",
        headers={"X-User-Role": "buyer"}
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(blocked_req)
    assert exc_info.value.code == 403


def test_api_crm_inquiries_and_communications():
    # 1. Post new inquiry via sales role
    payload = json.dumps({
        "customer_name": "Tendai Chikore",
        "phone": "+263 772 334 455",
        "email": "tchikore@mining.co.zw",
        "source_channel": "WHATSAPP_BOT",
        "property_interest": "Parkview Heights Stand 415",
        "budget_usd": 38000.0,
        "notes": "Interested in outright cash deal",
        "urgency": "High",
        "is_diaspora": False
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/crm/inquiries",
        data=payload,
        headers={"Content-Type": "application/json", "X-User-Role": "sales"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        inq_data = json.loads(resp.read().decode())
        assert inq_data["customer_name"] == "Tendai Chikore"
        assert inq_data["budget_usd"] == 38000.0
        assert "hmac_signature" in inq_data
        assert len(inq_data["hmac_signature"]) == 64

    # 2. Get inquiries list
    get_req = urllib.request.Request(
        f"{BASE_URL}/api/crm/inquiries?channel=WHATSAPP_BOT",
        headers={"X-User-Role": "sales"}
    )
    with urllib.request.urlopen(get_req) as resp:
        assert resp.status == 200
        inq_list = json.loads(resp.read().decode())
        assert inq_list["total"] >= 1

    # 3. Log communication
    comm_payload = json.dumps({
        "customer_id_or_name": "Tendai Chikore",
        "inquiry_or_deal_ref": inq_data["inquiry_id"],
        "channel": "WHATSAPP",
        "direction": "OUTBOUND",
        "agent_name": "Tapiwa Zhou",
        "summary": "Shared zoning scheme map and proof of municipal water connection.",
        "client_sentiment": "Enthusiastic"
    }).encode("utf-8")

    comm_req = urllib.request.Request(
        f"{BASE_URL}/api/crm/communications",
        data=comm_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "sales"}
    )
    with urllib.request.urlopen(comm_req) as resp:
        assert resp.status == 200
        comm_data = json.loads(resp.read().decode())
        assert comm_data["client_sentiment"] == "Enthusiastic"
        assert "hmac_signature" in comm_data

    # 4. Digital Channel Metrics
    metrics_req = urllib.request.Request(
        f"{BASE_URL}/api/crm/channels/metrics",
        headers={"X-User-Role": "sales"}
    )
    with urllib.request.urlopen(metrics_req) as resp:
        assert resp.status == 200
        metrics = json.loads(resp.read().decode())
        assert metrics["digital_response_sla_minutes"] <= 5.0
        assert "WHATSAPP_BOT" in metrics["omnichannel_breakdown"]


def test_api_hr_payroll_endpoints():
    # 1. HR Summary
    req_sum = urllib.request.Request(
        f"{BASE_URL}/api/hr/summary",
        headers={"X-User-Role": "hr"}
    )
    with urllib.request.urlopen(req_sum) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["active_headcount"] >= 3
        assert data["total_workforce_count"] >= 3

    # 2. Onboard Employee
    payload_emp = json.dumps({
        "full_name": "Rutendo Chidzero",
        "national_id": "63-889102-M-11",
        "job_title": "Class 1 Electrician",
        "department": "Civil & Building",
        "nec_grade": "Grade 7: Class 1 Artisan (Journeyman Builder/Plant Operator)",
        "contract_type": "NEC Construction Site Artisan",
        "base_salary_usd": 1550.0,
        "site_assigned": "Parkview Heights High-Rise"
    }).encode("utf-8")
    req_onboard = urllib.request.Request(
        f"{BASE_URL}/api/hr/employee/onboard",
        data=payload_emp,
        headers={"Content-Type": "application/json", "X-User-Role": "hr"}
    )
    with urllib.request.urlopen(req_onboard) as resp:
        assert resp.status == 200
        emp_res = json.loads(resp.read().decode())
        assert emp_res["full_name"] == "Rutendo Chidzero"
        assert "hmac_signature" in emp_res

    # 3. Log Attendance
    payload_att = json.dumps({
        "employee_id": emp_res["employee_id"],
        "site_id": "SITE-001",
        "site_name": "Parkview Heights",
        "clock_in_time": "07:00",
        "clock_out_time": "17:00",
        "regular_hours": 8.0,
        "overtime_1_5x_hours": 2.0,
        "gps_coordinates": "-17.8292, 31.0522"
    }).encode("utf-8")
    req_att = urllib.request.Request(
        f"{BASE_URL}/api/hr/attendance/log",
        data=payload_att,
        headers={"Content-Type": "application/json", "X-User-Role": "hr"}
    )
    with urllib.request.urlopen(req_att) as resp:
        assert resp.status == 200
        att_res = json.loads(resp.read().decode())
        assert att_res["total_hours_worked"] == 10.0
        assert "hmac_signature" in att_res

    # 4. Process Localized Zimbabwean Payroll
    payload_pay = json.dumps({"period": "2026-10"}).encode("utf-8")
    req_pay = urllib.request.Request(
        f"{BASE_URL}/api/hr/payroll/process",
        data=payload_pay,
        headers={"Content-Type": "application/json", "X-User-Role": "hr"}
    )
    with urllib.request.urlopen(req_pay) as resp:
        assert resp.status == 200
        pay_res = json.loads(resp.read().decode())
        assert pay_res["total_gross_payroll_usd"] > 0
        assert pay_res["total_net_payable_usd"] > 0
        assert "hmac_signature" in pay_res


def test_api_fleet_telematics_and_appraisal_endpoints():
    # 1. Fleet Summary
    req_fleet = urllib.request.Request(
        f"{BASE_URL}/api/fleet/summary",
        headers={"X-User-Role": "fleet"}
    )
    with urllib.request.urlopen(req_fleet) as resp:
        assert resp.status == 200
        fleet_data = json.loads(resp.read().decode())
        assert fleet_data["total_fleet_assets"] >= 4

    # 2. Shift Telematics Log
    payload_shift = json.dumps({
        "asset_id": "EQ-CAT-320D",
        "operator_name": "Farai Shumba",
        "site_location": "Parkview Heights Stand #001",
        "engine_hours": 7.0,
        "idle_hours": 1.0,
        "breakdown_hours": 0.0,
        "project_cost_code": "CIV-EXCAV-02"
    }).encode("utf-8")
    req_shift = urllib.request.Request(
        f"{BASE_URL}/api/fleet/shift/log",
        data=payload_shift,
        headers={"Content-Type": "application/json", "X-User-Role": "fleet"}
    )
    with urllib.request.urlopen(req_shift) as resp:
        assert resp.status == 200
        shift_res = json.loads(resp.read().decode())
        assert shift_res["engine_run_hours"] == 7.0
        assert "hmac_signature" in shift_res

    # 3. Fuel Dispensing Log
    payload_fuel = json.dumps({
        "asset_id": "EQ-CAT-320D",
        "fuel_type": "Diesel 50ppm",
        "liters": 128.0,
        "unit_price_usd": 1.62,
        "bowser_or_station": "Main Site Bowser",
        "meter_reading": 4127.5,
        "hours_or_km_delta": 7.0
    }).encode("utf-8")
    req_fuel = urllib.request.Request(
        f"{BASE_URL}/api/fleet/fuel/log",
        data=payload_fuel,
        headers={"Content-Type": "application/json", "X-User-Role": "fleet"}
    )
    with urllib.request.urlopen(req_fuel) as resp:
        assert resp.status == 200
        fuel_res = json.loads(resp.read().decode())
        assert fuel_res["liters_dispensed"] == 128.0
        assert "hmac_signature" in fuel_res

    # 4. Equipment Appraisal
    payload_app = json.dumps({
        "asset_id": "EQ-CAT-320D",
        "certified_appraiser": "Eng. Kudakwashe Marufu, Pr.Eng",
        "condition_grade": "Grade B: Good / Minor Wear",
        "engine_health_pct": 89.0,
        "hydraulics_health_pct": 86.0,
        "undercarriage_tires_pct": 80.0,
        "chassis_structural_pct": 92.0,
        "electrical_system_pct": 85.0,
        "appraised_fair_market_value_usd": 148000.0,
        "replacement_cost_new_usd": 215000.0,
        "notes": "Verified clean hydraulic oil and fresh undercarriage pin wear."
    }).encode("utf-8")
    req_app = urllib.request.Request(
        f"{BASE_URL}/api/fleet/appraisal",
        data=payload_app,
        headers={"Content-Type": "application/json", "X-User-Role": "fleet"}
    )
    with urllib.request.urlopen(req_app) as resp:
        assert resp.status == 200
        app_res = json.loads(resp.read().decode())
        assert app_res["appraised_fair_market_value_usd"] == 148000.0
        assert "certification_hmac_hash" in app_res


def test_api_field_service_endpoints():
    # 1. Field Service Summary
    req_fs = urllib.request.Request(
        f"{BASE_URL}/api/fieldservice/summary",
        headers={"X-User-Role": "fieldservice"}
    )
    with urllib.request.urlopen(req_fs) as resp:
        assert resp.status == 200
        fs_data = json.loads(resp.read().decode())
        assert fs_data["total_service_requests"] >= 2
        assert len(fs_data["technicians"]) >= 3

    # 2. Dispatch Work Order
    payload_disp = json.dumps({
        "request_id": "SR-2026-002",
        "tech_id": "TECH-002",
        "scope_of_work": "Replace burst hydraulic hose on CAT 320D boom cylinder.",
        "hourly_labor_rate_usd": 45.0
    }).encode("utf-8")
    req_disp = urllib.request.Request(
        f"{BASE_URL}/api/fieldservice/dispatch",
        data=payload_disp,
        headers={"Content-Type": "application/json", "X-User-Role": "fieldservice"}
    )
    with urllib.request.urlopen(req_disp) as resp:
        assert resp.status == 200
        disp_res = json.loads(resp.read().decode())
        assert disp_res["assigned_tech_id"] == "TECH-002"
        assert "hmac_signature" in disp_res

    # 3. Mobile Field Log (GPS & Photo)
    payload_mob = json.dumps({
        "wo_id": disp_res["wo_id"],
        "tech_id": "TECH-002",
        "action_type": "GPS_CHECKIN",
        "gps_lat_lng": "-18.3333, 29.9167",
        "photo_data": "hydraulic_hose_burst_photo_data_1234",
        "notes": "Arrived at Kadoma borrow pit station 4."
    }).encode("utf-8")
    req_mob = urllib.request.Request(
        f"{BASE_URL}/api/fieldservice/mobile/log",
        data=payload_mob,
        headers={"Content-Type": "application/json", "X-User-Role": "fieldservice"}
    )
    with urllib.request.urlopen(req_mob) as resp:
        assert resp.status == 200
        mob_res = json.loads(resp.read().decode())
        assert mob_res["action_type"] == "GPS_CHECKIN"
        assert "hmac_signature" in mob_res

    # 4. Complete Work Order
    payload_comp = json.dumps({
        "wo_id": disp_res["wo_id"],
        "labor_hours": 2.5,
        "work_notes": "Hydraulic hose replaced with high-pressure 4-spiral hose, fluid topped up, pressure tested at 320 bar.",
        "client_name": "Site Supt Tapiwa Zhou"
    }).encode("utf-8")
    req_comp = urllib.request.Request(
        f"{BASE_URL}/api/fieldservice/workorder/complete",
        data=payload_comp,
        headers={"Content-Type": "application/json", "X-User-Role": "fieldservice"}
    )
    with urllib.request.urlopen(req_comp) as resp:
        assert resp.status == 200
        comp_res = json.loads(resp.read().decode())
        assert comp_res["status"] == "Completed"
        assert comp_res["digital_signature_hash"] is not None


def test_api_security_headers():
    req = urllib.request.Request(f"{BASE_URL}/api/health")
    with urllib.request.urlopen(req) as resp:
        headers = dict(resp.headers)
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "SAMEORIGIN"
        assert headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Strict-Transport-Security" in headers
        assert "max-age=31536000" in headers["Strict-Transport-Security"]
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "Permissions-Policy" in headers


def test_api_verify_ledger_endpoint():
    req = urllib.request.Request(
        f"{BASE_URL}/api/security/verify_ledger",
        headers={"X-User-Role": "sysadmin"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        res = json.loads(resp.read().decode())
        assert res["valid"] is True
        assert len(res["tampered_indices"]) == 0
        assert res["total_blocks"] > 0


def test_api_project_schedule_endpoints():
    # 1. Get schedule summary
    req = urllib.request.Request(
        f"{BASE_URL}/api/project/schedule",
        headers={"X-User-Role": "qs"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["total_tasks"] >= 10
        assert data["critical_path_tasks_count"] >= 5

    # 2. Update task progress
    payload = json.dumps({"task_id": "TSK-08", "progress_pct": 80}).encode("utf-8")
    post_req = urllib.request.Request(
        f"{BASE_URL}/api/project/task/update",
        data=payload,
        headers={"Content-Type": "application/json", "X-User-Role": "builder"}
    )
    with urllib.request.urlopen(post_req) as resp:
        assert resp.status == 200
        upd = json.loads(resp.read().decode())
        assert upd["progress_pct"] == 80
        assert "hmac_signature" in upd


def test_api_quality_hse_and_cube_test_endpoints():
    # 1. Summary
    req = urllib.request.Request(
        f"{BASE_URL}/api/quality/summary",
        headers={"X-User-Role": "builder"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["total_cube_tests"] >= 2
        assert "cube_tests" in data

    # 2. Log Concrete Cube Crush Test
    cube_payload = json.dumps({
        "pour_location": "Stand 002 Ring Beam",
        "structural_element": "Ring Beam",
        "mix_designation": "C25",
        "slump_mm": 90,
        "strength_7day_mpa": 19.0,
        "strength_28day_mpa": 28.5,
        "tested_by": "SAZ Materials Testing Lab"
    }).encode("utf-8")
    post_cube = urllib.request.Request(
        f"{BASE_URL}/api/quality/cube-test",
        data=cube_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "builder"}
    )
    with urllib.request.urlopen(post_cube) as resp:
        assert resp.status == 200
        cube_res = json.loads(resp.read().decode())
        assert cube_res["passed"] is True
        assert "hmac_signature" in cube_res


def test_api_mortgage_and_permits_endpoints():
    # 1. Calculate Mortgage
    mort_payload = json.dumps({
        "property_price_usd": 65000.0,
        "deposit_pct": 20.0,
        "loan_term_years": 5,
        "annual_interest_rate_pct": 12.0
    }).encode("utf-8")
    mort_req = urllib.request.Request(
        f"{BASE_URL}/api/mortgage/calculate",
        data=mort_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "sales"}
    )
    with urllib.request.urlopen(mort_req) as resp:
        assert resp.status == 200
        mort_res = json.loads(resp.read().decode())
        assert mort_res["deposit_usd"] == 13000.0
        assert mort_res["monthly_installment_usd"] > 0
        assert "hmac_signature" in mort_res

    # 2. Permits Overview
    perm_req = urllib.request.Request(
        f"{BASE_URL}/api/permits/overview",
        headers={"X-User-Role": "planner"}
    )
    with urllib.request.urlopen(perm_req) as resp:
        assert resp.status == 200
        perm_res = json.loads(resp.read().decode())
        assert perm_res["total_stages"] == 6

    # 3. Signoff Permit
    sign_payload = json.dumps({
        "stage_id": 5,
        "inspector_name": "City Building Inspector Moyo",
        "certificate_hash": "hash_roof_cert_123"
    }).encode("utf-8")
    sign_req = urllib.request.Request(
        f"{BASE_URL}/api/permits/signoff",
        data=sign_payload,
        headers={"Content-Type": "application/json", "X-User-Role": "builder"}
    )
    with urllib.request.urlopen(sign_req) as resp:
        assert resp.status == 200
        sign_res = json.loads(resp.read().decode())
        assert sign_res["status"] == "PASSED"
        assert "hmac_signature" in sign_res


# ==============================================================================
# ISO/IEC 27001:2022 ANNEX A CRITICAL SECURITY REGRESSION SUITE
# ==============================================================================

def test_iso_27001_unauthenticated_request_blocked():
    """ISO A.8.26: Protected endpoints must return 401 when X-User-Role is missing."""
    req = urllib.request.Request(f"{BASE_URL}/api/portfolio")
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req)
    assert exc.value.code == 401
    body = json.loads(exc.value.read().decode())
    assert body["security_status"] == "AUTHENTICATION_REQUIRED"


def test_iso_27001_pii_redaction_and_access_control():
    """ISO A.8.12: Citizen PII (National ID, Phone, Email) must be masked in API output."""
    # Unauthenticated request blocked
    req_unauth = urllib.request.Request(f"{BASE_URL}/api/youth/applicants")
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req_unauth)
    assert exc.value.code == 401

    # Authenticated request returns masked PII
    req = urllib.request.Request(
        f"{BASE_URL}/api/youth/applicants",
        headers={"X-User-Role": "sales"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert len(data["applicants"]) > 0
        for app in data["applicants"]:
            assert "******" in app["national_id"], f"Unmasked National ID found: {app['national_id']}"
            assert "****" in app["phone"], f"Unmasked Phone found: {app['phone']}"
            assert "***@" in app["email"], f"Unmasked Email found: {app['email']}"


def test_iso_27001_allocations_and_messaging_pii_masked():
    """ISO A.8.12: Buyer phone numbers in allocations and outbox must be masked."""
    # Allocations
    req = urllib.request.Request(
        f"{BASE_URL}/api/allocations/register",
        headers={"X-User-Role": "sales"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        for a in data["allocations"]:
            assert "****" in a["buyer_phone"], f"Unmasked phone: {a['buyer_phone']}"

    # Messaging outbox
    req_msg = urllib.request.Request(
        f"{BASE_URL}/api/messaging/outbox",
        headers={"X-User-Role": "sysadmin"}
    )
    with urllib.request.urlopen(req_msg) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        for m in data["messages"]:
            assert "****" in m["recipient"], f"Unmasked recipient: {m['recipient']}"


def test_iso_27001_source_code_disclosure_blocked():
    """ISO A.8.28: Direct requests for .py, .json, and config files must be blocked (403)."""
    prohibited_paths = [
        "/server.py",
        "/main.py",
        "/package.json",
        "/requirements.txt",
        "/tests/conftest.py",
        "/.git/config",
        "/.env"
    ]
    for path in prohibited_paths:
        req = urllib.request.Request(f"{BASE_URL}{path}")
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req)
        assert exc.value.code == 403, f"Path {path} did not return 403 (got {exc.value.code})"
        body = json.loads(exc.value.read().decode())
        assert body["security_status"] in ("SOURCE_CODE_ACCESS_BLOCKED", "PATH_TRAVERSAL_BLOCKED")


def test_iso_27001_public_static_assets_allowed():
    """ISO A.8.28: Legitimate public assets like index.html must remain accessible."""
    req = urllib.request.Request(f"{BASE_URL}/index.html")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8", errors="ignore")
        assert "<!DOCTYPE html>" in content


def test_iso_27001_cors_and_security_headers():
    """ISO A.8.26: CORS preflight must return appropriate origin, and enterprise security headers must be present."""
    # OPTIONS request with local dev origin
    req = urllib.request.Request(
        f"{BASE_URL}/api/health",
        headers={"Origin": "http://localhost:1420"},
        method="OPTIONS"
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        headers = dict(resp.headers)
        assert headers.get("Access-Control-Allow-Origin") == "http://localhost:1420"
        assert "POST" in headers.get("Access-Control-Allow-Methods", "")
        assert "X-User-Role" in headers.get("Access-Control-Allow-Headers", "")

    # GET response must carry ISO security headers
    get_req = urllib.request.Request(f"{BASE_URL}/api/health")
    with urllib.request.urlopen(get_req) as resp:
        headers = dict(resp.headers)
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "SAMEORIGIN"
        assert "Content-Security-Policy" in headers


def test_iso_27001_subresource_integrity_attributes():
    """ISO A.8.30: External CDN dependencies must declare Subresource Integrity (SRI) hashes."""
    req = urllib.request.Request(f"{BASE_URL}/index.html")
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8")
        assert 'integrity="sha384-' in content
        assert 'crossorigin="anonymous"' in content
        assert "leaflet@1.9.4" in content
        assert "font-awesome/6.4.0" in content


# ==============================================================================
# COMPREHENSIVE ERP MODULES FUNCTIONAL TESTS
# ==============================================================================

def test_api_crm_pipeline_and_inquiries():
    """CRM: Pipeline metrics, digital inquiries, and channels CX endpoints."""
    # Pipeline summary for CEO
    req = urllib.request.Request(f"{BASE_URL}/api/crm/pipeline", headers={"X-User-Role": "ceo"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert "total_deals_count" in data
        assert "total_pipeline_value_usd" in data

    # Digital channels metrics
    req2 = urllib.request.Request(f"{BASE_URL}/api/crm/channels/metrics", headers={"X-User-Role": "ceo"})
    with urllib.request.urlopen(req2) as resp:
        assert resp.status == 200
        data2 = json.loads(resp.read().decode())
        assert isinstance(data2, dict)


def test_api_supply_chain_wms_stock_and_mrp():
    """Supply Chain: WMS inventory stock, warehouse locations, and MRP BOM explosion."""
    req = urllib.request.Request(f"{BASE_URL}/api/supplychain/wms/stock", headers={"X-User-Role": "ceo"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert "stock" in data
        assert "locations" in data

    # MRP Explosion
    req2 = urllib.request.Request(
        f"{BASE_URL}/api/supplychain/mfg/explode?code=PREFAB-WALL-STD&qty=20",
        headers={"X-User-Role": "ceo"}
    )
    with urllib.request.urlopen(req2) as resp:
        assert resp.status == 200
        data2 = json.loads(resp.read().decode())
        assert data2.get("success") is True
        assert data2.get("product_code") == "PREFAB-WALL-STD"


def test_api_fleet_and_field_service_summary():
    """Fleet & Field Service: Equipment appraisal and work orders overview."""
    req = urllib.request.Request(f"{BASE_URL}/api/fleet/summary", headers={"X-User-Role": "ceo"})
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert "total_fleet_assets" in data
        assert "total_net_book_value_usd" in data

    req2 = urllib.request.Request(f"{BASE_URL}/api/fieldservice/summary", headers={"X-User-Role": "ceo"})
    with urllib.request.urlopen(req2) as resp:
        assert resp.status == 200
        data2 = json.loads(resp.read().decode())
        assert isinstance(data2, dict)




