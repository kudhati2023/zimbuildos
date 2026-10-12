"""
Comprehensive Unit & Integration Tests for:
4. Human Capital & Field Service
- HR & Payroll Management (Employee lifecycle, recruitment, site muster roll, localized Zimbabwean payroll)
- Fleet & Asset Appraisals (Corporate vehicles, machinery utilization, fuel monitor & anomaly alerts, IAS 16 appraisals)
- Field Service Operations (Dispatch, work orders with JSA safety, parts tracking, mobile logging with GPS & photo hash)
"""

import pytest
from src.erp.hr_payroll_manager import (
    HRPayrollManager, EmployeeStatus, ContractType, NECGrade
)
from src.erp.fleet_appraisal_manager import (
    FleetAppraisalManager, AssetCategory, AssetStatus, ConditionGrade
)
from src.erp.field_service_manager import (
    FieldServiceManager, ServicePriority, ServiceCategory, WorkOrderStatus
)


# ==============================================================================
# 1. HR & PAYROLL MANAGEMENT TESTS
# ==============================================================================

def test_hr_employee_lifecycle():
    hr = HRPayrollManager(rbz_zwg_rate=26.50)
    
    # 1. Onboarding
    emp = hr.onboard_employee(
        full_name="Kudakwashe Moyo",
        national_id="63-918273-J-12",
        job_title="Junior Bricklayer",
        department="Civil & Building",
        nec_grade=NECGrade.GRADE_4.value,
        contract_type=ContractType.NEC_ARTISAN.value,
        base_salary_usd=950.0,
        site_assigned="Parkview Heights High-Rise",
        bank_name="First Capital Bank",
        bank_account="1029384756",
        ecocash_number="+263 773 111 222"
    )
    assert emp.employee_id.startswith("EMP-2026-")
    assert emp.status == EmployeeStatus.ACTIVE.value
    assert emp.leave_balances["annual"] == 21

    # 2. Promotion
    emp.promote(
        new_title="Class 1 Journeyman Bricklayer",
        new_grade=NECGrade.GRADE_7.value,
        new_salary_usd=1450.0,
        notes="Passed trade test at Harare Polytechnic"
    )
    assert emp.job_title == "Class 1 Journeyman Bricklayer"
    assert emp.nec_grade == NECGrade.GRADE_7.value
    assert emp.base_salary_usd == 1450.0
    assert len(emp.history) == 1
    assert emp.history[0]["action"] == "PROMOTION"

    # 3. Leave Application
    res_leave = hr.request_leave(emp.employee_id, "annual", 5)
    assert res_leave["success"] is True
    assert res_leave["remaining_balance"] == 16
    assert emp.leave_balances["annual"] == 16

    # Test insufficient leave
    res_excess = hr.request_leave(emp.employee_id, "annual", 30)
    assert res_excess["success"] is False

    # 4. Termination / Exit
    emp.terminate_employment("Mutual separation at contract completion", notice_days=30)
    assert emp.status == EmployeeStatus.TERMINATED.value


def test_recruitment_pipeline():
    hr = HRPayrollManager()
    
    # 1. Requisition creation
    req = hr.create_job_requisition(
        title="Class 1 Structural Welder",
        department="Civil & Building",
        openings=2,
        nec_grade=NECGrade.GRADE_7.value,
        budget_salary_usd=1600.0
    )
    assert req.req_id.startswith("REQ-2026-")
    assert req.status == "Open"

    # 2. Candidate Application
    cand = hr.apply_candidate(
        req_id=req.req_id,
        full_name="Munyaradzi Shumba",
        national_id="42-192837-W-19",
        qualification="Class 1 Coded Welder (ASME IX)",
        experience_years=6.0,
        phone="+263 772 888 999",
        email="munya.welder@zimbuild.co.zw"
    )
    assert cand.candidate_id.startswith("CAND-")
    assert cand.status == "Applied"
    assert hr.requisitions[req.req_id].applicants_count >= 1

    # 3. Interview Evaluation
    score = cand.evaluate_interview(technical_score=90.0, safety_score=85.0, trade_test_score=88.0)
    assert score >= 85.0
    assert cand.status == "Offered"

    # 4. Hire candidate -> converts into EmployeeProfile
    new_hire = hr.hire_candidate(cand.candidate_id, site_assigned="Parkview Heights High-Rise")
    assert new_hire is not None
    assert new_hire.full_name == "Munyaradzi Shumba"
    assert new_hire.base_salary_usd == 1600.0
    assert cand.status == "Hired"


def test_site_attendance_muster_roll():
    hr = HRPayrollManager()
    
    # 1. Clock in / out with GPS & biometric hash
    att = hr.log_site_attendance(
        employee_id="EMP-2026-001",
        site_id="SITE-001",
        site_name="Parkview Heights High-Rise",
        clock_in="06:50",
        clock_out="17:20",
        shift_type="Day Shift",
        regular_hours=8.0,
        ot_1_5x=2.0,
        ot_2_0x=0.0,
        gps_coords="-17.8292, 31.0522"
    )
    assert att.total_hours_worked == 10.0
    assert att.biometric_or_pin_hash.startswith("BIO_GPS_")
    assert att.foreman_approved is False

    # 2. Foreman muster roll approval
    approved = hr.approve_muster_roll(att.record_id, foreman_name="Director of Works Eng. Manzungu")
    assert approved is True
    assert att.foreman_approved is True
    assert att.approved_by_foreman == "Director of Works Eng. Manzungu"


def test_localized_zimbabwean_payroll():
    hr = HRPayrollManager(rbz_zwg_rate=26.50)
    
    # 1. ZIMRA PAYE progressive tax verification
    # $1000 income: first $100 @ 0%, next $200 @ 20% ($40), next $700 @ 25% ($175) = $215
    paye_1000 = hr.calculate_zimra_paye_usd(1000.0)
    assert paye_1000 == 215.0

    # 2. Employee Payroll Slip Generation (EMP-2026-001 base: $2800)
    slip = hr.calculate_employee_payroll(
        employee_id="EMP-2026-001",
        period="2026-10",
        site_hardship_allowance=100.0,
        housing_allowance=250.0,
        transport_allowance=100.0,
        ot_1_5x_hours=4.0
    )
    assert slip.gross_earnings_usd > 2800.0
    # NSSA POBS capped at $700 ceiling -> $700 * 4.5% = $31.50
    assert slip.nssa_pobs_employee_usd == 31.50
    assert slip.nssa_pobs_employer_usd == 31.50
    # NEC Construction levy: 1.25% of base ($2800 * 0.0125 = $35.00)
    assert slip.nec_levy_employee_usd == 35.00
    assert slip.nec_levy_employer_usd == 35.00
    # ZIMRA PAYE and 3% AIDS Levy
    assert slip.zimra_paye_tax_usd > 0
    assert slip.aids_levy_usd == round(slip.zimra_paye_tax_usd * 0.03, 2)
    # Net salary
    assert slip.net_salary_usd == round(slip.gross_earnings_usd - slip.total_deductions_usd, 2)
    # Currency conversion into ZWG
    assert slip.net_salary_zwg == round(slip.net_salary_usd * 26.50, 2)
    # HMAC tamper-evident signature present
    assert len(slip.cryptographic_hmac_hash) == 64

    # 3. Company-Wide Batch Payroll Run & Double-Entry Journal
    batch = hr.run_company_payroll_batch("2026-10")
    assert batch["headcount"] >= 4
    assert batch["total_gross_payroll_usd"] > 0
    assert batch["total_net_payable_usd"] > 0
    assert batch["statutory_remittances"]["zimra_paye_and_aids_levy_usd"] > 0
    assert batch["statutory_remittances"]["nssa_pension_and_apwcs_usd"] > 0
    assert batch["statutory_remittances"]["nec_construction_levy_usd"] > 0
    assert batch["statutory_remittances"]["zimdef_manpower_levy_usd"] > 0
    assert batch["statutory_remittances"]["sdf_standards_levy_usd"] > 0
    # Journal debits and credits
    journal = batch["double_entry_journal"]
    assert journal["dr_payroll_salaries_expense_usd"] == batch["total_gross_payroll_usd"]


# ==============================================================================
# 2. FLEET & ASSET APPRAISALS TESTS
# ==============================================================================

def test_fleet_and_machinery_utilization():
    fm = FleetAppraisalManager()
    
    # 1. Fleet asset registration & verification
    asset = fm.fleet["EQ-CAT-320D"]
    assert asset.category == AssetCategory.HEAVY_EARTHMOVING.value
    assert asset.status == AssetStatus.OPERATIONAL.value
    assert asset.hourly_chargeout_rate_usd == 85.0

    # 2. Telematics Shift Log & Utilization Rate
    init_hours = asset.current_operating_hours
    log = fm.log_shift_telematics(
        asset_id="EQ-CAT-320D",
        operator_name="Farai Shumba",
        site_location="Parkview Heights High-Rise",
        engine_hours=8.0,
        idle_hours=1.5,
        breakdown_hours=0.5,
        project_cost_code="CIVIL-EXCAVATION-01"
    )
    assert log.total_shift_duration_hours == 10.0
    assert log.utilization_percentage == 80.0  # 8 / 10 = 80%
    assert log.total_cost_recovered_usd == 8.0 * 85.0  # $680.00
    assert asset.current_operating_hours == init_hours + 8.0


def test_fuel_consumption_and_siphoning_anomaly_detection():
    fm = FleetAppraisalManager()
    
    # 1. Normal Fuel Fill (within manufacturer benchmark of 18.5 L/hr)
    rec_normal = fm.record_fuel_dispense(
        asset_id="EQ-CAT-320D",
        fuel_type="Diesel 50ppm",
        liters=145.0,
        unit_price_usd=1.62,
        bowser_or_station="Site Bowser #01",
        meter_reading=4136.5,
        hours_or_km_delta=8.0  # 145 / 8 = 18.125 L/hr
    )
    assert rec_normal.is_anomaly_flagged is False
    assert rec_normal.burn_variance_pct < 0

    # 2. Anomaly Fuel Fill (abnormal high burn / suspected fuel theft/siphoning)
    # 240 liters in 8 hours = 30 L/hr (> 60% over 18.5 L/hr benchmark)
    rec_anomaly = fm.record_fuel_dispense(
        asset_id="EQ-CAT-320D",
        fuel_type="Diesel 50ppm",
        liters=240.0,
        unit_price_usd=1.62,
        bowser_or_station="Site Bowser #01",
        meter_reading=4144.5,
        hours_or_km_delta=8.0
    )
    assert rec_anomaly.is_anomaly_flagged is True
    assert "FUEL ANOMALY ALERT" in rec_anomaly.anomaly_reason
    assert rec_anomaly.burn_variance_pct > 20.0


def test_equipment_appraisals_and_ias16_revaluation():
    fm = FleetAppraisalManager()
    
    # 1. Straight-line and Machine-hour depreciation
    cat = fm.fleet["EQ-CAT-320D"]
    sld = cat.calculate_straight_line_depreciation(current_year=2026)
    assert sld["net_book_value_usd"] > 0
    assert sld["annual_depreciation_usd"] > 0

    mhd = cat.calculate_machine_hour_depreciation()
    assert mhd["net_book_value_usd"] > 0
    assert mhd["depreciation_rate_per_hour_usd"] > 0

    # 2. Certified Appraisal with Component Health Scoring & HMAC Seal
    appraisal = fm.appraise_equipment(
        asset_id="EQ-CAT-320D",
        certified_appraiser="Eng. K. Marufu (Pr.Eng Chartered Valuer)",
        condition_grade=ConditionGrade.GRADE_B.value,
        engine_health_pct=90.0,
        hydraulics_health_pct=88.0,
        undercarriage_tires_pct=82.0,
        chassis_structural_pct=94.0,
        electrical_system_pct=88.0,
        appraised_fmv_usd=150000.0,
        replacement_cost_new_usd=220000.0,
        notes="High-pressure pumps and travel motors in optimal condition."
    )
    assert appraisal.overall_health_score_pct >= 85.0
    assert appraisal.appraised_fair_market_value_usd == 150000.0
    assert appraisal.revaluation_surplus_or_deficit_usd != 0.0
    assert len(appraisal.certification_hmac_hash) == 64

    # 3. Fleet Summary
    summary = fm.get_fleet_summary()
    assert summary["total_fleet_assets"] >= 4
    assert summary["operational_fleet_count"] >= 3
    assert summary["total_appraised_valuation_usd"] > 0


# ==============================================================================
# 3. FIELD SERVICE OPERATIONS TESTS
# ==============================================================================

def test_field_service_dispatch_and_sla():
    fsm = FieldServiceManager()
    
    # 1. Log Service Request
    sr = fsm.create_service_request(
        category=ServiceCategory.PLUMBING_WATER.value,
        priority=ServicePriority.P1_EMERGENCY.value,
        site_location="Parkview Heights High-Rise",
        unit_or_stand_no="Stand #001 / Basement Booster Pump Room",
        client_name="Facilities Supervisor J. Moyo",
        phone="+263 774 200 300",
        problem_description="Basement high-pressure booster pump flange burst; water flooding electrical switchroom."
    )
    assert sr.request_id.startswith("SR-2026-")
    assert sr.target_sla_hours == 1.0  # P1 SLA
    assert sr.status == "Pending Dispatch"

    # 2. Dispatch Technician
    wo = fsm.dispatch_work_order(
        request_id=sr.request_id,
        tech_id="TECH-003",
        scope_of_work="Isolate isolation gate valves, replace ruptured 100mm flange gasket, test pump head pressure.",
        hourly_rate_usd=40.0
    )
    assert wo.wo_id.startswith("FWO-2026-")
    assert wo.status == WorkOrderStatus.DISPATCHED.value
    assert sr.status == "Dispatched"
    assert fsm.technicians["TECH-003"].current_status == "En Route"


def test_field_service_work_order_safety_and_completion():
    fsm = FieldServiceManager()
    wo_id = "FWO-2026-001"
    
    # 1. JSA Safety Checklist
    safety_ok = fsm.record_jsa_safety_checklist(
        wo_id=wo_id,
        hazard_controls=["Lockout/Tagout Applied", "Arc Flash Helmet & Gloves Worn", "Fire Extinguisher on Standby"]
    )
    assert safety_ok is True
    wo = fsm.work_orders[wo_id]
    assert wo.jsa_safety_checklist_completed is True
    assert wo.status == WorkOrderStatus.IN_PROGRESS.value

    # 2. Add Spare Parts Consumed
    cost = fsm.add_parts_to_work_order(
        wo_id=wo_id,
        part_code="EL-CONTACTOR-60A",
        description="Schneider 60A 3-Phase Contactor",
        qty=1.0,
        unit_price_usd=85.0
    )
    assert cost > 85.0
    assert wo.total_parts_cost_usd > 85.0

    # 3. Complete Work Order with Client Digital Sign-off
    completed_wo = fsm.complete_work_order(
        wo_id=wo_id,
        labor_hours=3.5,
        work_notes="Contactor replaced, main circuit energized, phase balance verified at 415V.",
        client_name="Stanbic Facilities Manager"
    )
    assert completed_wo.status == WorkOrderStatus.COMPLETED.value
    assert completed_wo.labor_hours_logged == 3.5
    assert completed_wo.total_labor_cost_usd == 3.5 * completed_wo.hourly_labor_rate_usd
    assert completed_wo.total_work_order_cost_usd > 0
    assert len(completed_wo.digital_signature_hash) == 64
    assert fsm.technicians[completed_wo.assigned_tech_id].current_status == "Available"


def test_mobile_field_logging_with_gps_and_photo_verification():
    fsm = FieldServiceManager()
    
    # 1. Mobile GPS check-in & photo proof hash
    log = fsm.record_mobile_field_log(
        wo_id="FWO-2026-001",
        tech_id="TECH-001",
        action_type="GPS_CHECKIN",
        gps_lat_lng="-17.8292, 31.0522",
        photo_bytes_or_string="sample_camera_photo_repair_bytes_123",
        notes="Technician on site at Parkview Heights switchroom."
    )
    assert log.log_id.startswith("MLOG-")
    assert log.photo_hash.startswith("PHOTO_SHA256_")
    assert fsm.technicians["TECH-001"].current_gps_coords == "-17.8292, 31.0522"

    # 2. Summary
    summary = fsm.get_field_service_summary()
    assert summary["total_service_requests"] >= 2
    assert summary["available_technicians_count"] >= 1
    assert len(summary["recent_mobile_logs"]) >= 1
