"""
Comprehensive Unit & Integration Test Suite for Real Estate & Building Construction ERP Suite.
Tests:
- RLV & Pro-Forma (Levered/Unlevered IRR, NPV, DSCR, Sensitivity Grid)
- Spatial Coordinate Conversion (WGS84 -> UTM) & Lot Polygon Subdivision
- Civil BOQ Parsing & TQM Inspection Severity Routing
- Land Sales Inventory Concurrency & Milestone Commissions
- Project Manager EVM (SV, CV, SPI, CPI), AIA G702/G703 Retainage, Change Orders
- Executive Management BI Aggregation & Predictive Risk (CPI < 0.90, SPI < 0.85)
- Finance Multi-Currency FX Gain/Loss & CAM Reconciliations
- Marketing Lead Attribution & Campaign ROMI
- HR Geofenced Mobile Check-In & Payroll Multipliers
- Operations 3-Way Match & Plant Equipment Utilization
- FastAPI TestClient Endpoint Verification
"""

import pytest
from datetime import date, datetime, timezone
from fastapi.testclient import TestClient

from src.real_estate_erp.schemas import (
    ProFormaRequestDTO,
    SensitivityStressTestDTO,
    CoordinateConversionRequestDTO,
    LotSubdivisionRequestDTO,
    CommissionCalculationDTO,
    EvmMetricsDTO,
    AiaG702BillingDTO,
    ChangeOrderCreateDTO,
    PortfolioProjectSummaryDTO,
    MultiCurrencyFxConversionDTO,
    CamReconciliationDTO,
    LeadWebhookDTO,
    CampaignPerformanceDTO,
    MobileGeofencedCheckInDTO,
    SiteWorkerPayrollDTO,
    ThreeWayMatchVerificationDTO,
    PlantAssetUsageDTO
)
from src.real_estate_erp.services import (
    LandDeveloperService,
    LandSurveyorService,
    CivilDesignService,
    LandSalesService,
    ProjectManagerService,
    ExecutiveManagementService,
    FinanceAccountingService,
    MarketingService,
    HrPayrollService,
    OperationsService
)
from src.real_estate_erp.main import app


@pytest.fixture
def client():
    return TestClient(app)


# ============================================================================
# MODULE 1: LAND DEVELOPER TESTS
# ============================================================================
def test_rlv_proforma_calculation():
    req = ProFormaRequestDTO(
        gross_realization_value=10000000.0,
        hard_costs=5000000.0,
        soft_costs=1000000.0,
        finance_costs=500000.0,
        target_developer_margin_pct=20.0,
        margin_basis="ON_GRV",
        project_duration_months=24,
        equity_contribution_pct=30.0,
        debt_interest_rate_pct=8.0,
        discount_rate_pct=10.0,
        annual_net_operating_income=800000.0,
        annual_debt_service=500000.0
    )
    res = LandDeveloperService.calculate_rlv_and_proforma(req)

    # RLV = 10,000,000 - (6,000,000 + 500,000 + 2,000,000) = 1,500,000
    assert res.residual_land_value == 1500000.0
    assert res.total_construction_hard_soft == 6000000.0
    assert res.target_developer_margin_usd == 2000000.0
    assert res.dscr == 1.6
    assert res.npv_usd > 0
    assert res.levered_irr_pct > 0


def test_sensitivity_stress_testing():
    base = ProFormaRequestDTO(
        gross_realization_value=5000000.0,
        hard_costs=2500000.0,
        soft_costs=500000.0,
        finance_costs=250000.0,
        target_developer_margin_pct=15.0,
        margin_basis="ON_GRV"
    )
    stress = SensitivityStressTestDTO(
        base_request=base,
        cost_variation_pcts=[-10.0, 0.0, 10.0],
        lease_up_speed_factors=[0.9, 1.0, 1.1],
        exit_cap_rates=[0.08]
    )
    grid = LandDeveloperService.sensitivity_stress_test(stress)
    assert grid["total_scenarios_evaluated"] == 9
    assert len(grid["scenarios"]) == 9
    # Scenarios with -10% hard cost variation should have higher RLV than +10%
    rlv_minus_10 = [s["residual_land_value"] for s in grid["scenarios"] if s["cost_variation_pct"] == -10.0 and s["lease_up_speed_factor"] == 1.0][0]
    rlv_plus_10 = [s["residual_land_value"] for s in grid["scenarios"] if s["cost_variation_pct"] == 10.0 and s["lease_up_speed_factor"] == 1.0][0]
    assert rlv_minus_10 > rlv_plus_10


# ============================================================================
# MODULE 2: LAND SURVEYOR TESTS
# ============================================================================
def test_coordinate_conversion_engine():
    # Harare, Zimbabwe coordinates -> UTM Zone 36S (EPSG:32736)
    req = CoordinateConversionRequestDTO(
        wgs84_latitude=-17.824858,
        wgs84_longitude=31.053028,
        target_epsg=32736
    )
    res = LandSurveyorService.convert_wgs84_to_projected(req)
    assert res.projected_easting_x > 200000.0
    assert res.projected_northing_y > 8000000.0


def test_lot_subdivision_service():
    # Define a 100m x 100m square polygon
    parent_poly = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]
    }
    req = LotSubdivisionRequestDTO(
        parent_polygon_geojson=parent_poly,
        target_lot_count=4,
        setback_buffer_meters=2.0,
        easement_width_meters=4.0
    )
    res = LandSurveyorService.subdivide_lot_polygon(req)
    assert res["parent_total_area"] == 10000.0
    assert res["lots_generated_count"] == 4
    for lot in res["lots"]:
        assert lot["lot_area_sq_units"] > 2000.0


# ============================================================================
# MODULE 3: CIVIL & DESIGN TESTS
# ============================================================================
def test_boq_csv_parser_and_mapping():
    csv_sample = """cost_code,wbs_element,description,unit,quantity,rate
03-3000,WBS.1.2.1,Ready-Mix Concrete C30,m3,450.5,120.0
05-1200,WBS.1.3.4,Reinforcement Steel High-Tensile,ton,35.0,950.0
"""
    items = CivilDesignService.parse_boq_csv_and_map(csv_sample)
    assert len(items) == 2
    assert items[0]["cost_code"] == "03-3000"
    assert items[0]["total_budget_usd"] == 54060.0
    assert items[1]["total_budget_usd"] == 33250.0


def test_tqm_inspection_routing():
    res_critical = CivilDesignService.evaluate_inspection_severity_routing("CRITICAL", "Rebar cage shifted")
    assert res_critical["stop_work_order_required"] is True
    assert res_critical["deadline_hours"] == 8

    res_minor = CivilDesignService.evaluate_inspection_severity_routing("MINOR", "Scratch on door jamb")
    assert res_minor["stop_work_order_required"] is False
    assert res_minor["deadline_hours"] == 72


# ============================================================================
# MODULE 4: LAND SALES TESTS
# ============================================================================
def test_inventory_state_machine_and_concurrency():
    assert LandSalesService.validate_transition("Available", "Reserved") is True
    assert LandSalesService.validate_transition("Reserved", "Booked") is True
    assert LandSalesService.validate_transition("Booked", "Sold") is True
    assert LandSalesService.validate_transition("Sold", "Available") is False  # Terminal state


def test_commission_milestone_engine():
    # 25% downpayment with 20% milestone -> authorized
    req_auth = CommissionCalculationDTO(
        unit_price_usd=120000.0,
        tier_level=2,  # 7%
        downpayment_received_pct=25.0,
        trigger_milestone_pct=20.0
    )
    res_auth = LandSalesService.calculate_commission(req_auth)
    assert res_auth["commission_amount_usd"] == 8400.0
    assert res_auth["payout_authorized"] is True

    # 15% downpayment with 20% milestone -> held
    req_hold = CommissionCalculationDTO(
        unit_price_usd=120000.0,
        tier_level=2,
        downpayment_received_pct=15.0,
        trigger_milestone_pct=20.0
    )
    res_hold = LandSalesService.calculate_commission(req_hold)
    assert res_hold["payout_authorized"] is False


# ============================================================================
# MODULE 5: PROJECT MANAGER TESTS
# ============================================================================
def test_evm_calculation_service():
    metrics = EvmMetricsDTO(
        planned_value_pv=100000.0,
        earned_value_ev=80000.0,
        actual_cost_ac=95000.0
    )
    res = ProjectManagerService.calculate_evm(metrics)
    assert res.schedule_variance_sv == -20000.0
    assert res.cost_variance_cv == -15000.0
    assert res.schedule_performance_index_spi == 0.8
    assert res.cost_performance_index_cpi == 0.842
    assert res.status == "CRITICAL_ALERT"  # CPI < 0.90 and SPI < 0.85


def test_aia_g702_progress_billing():
    req = AiaG702BillingDTO(
        project_id="PROJ-01",
        application_number=3,
        period_to=date(2026, 10, 15),
        contract_sum_to_date=1000000.0,
        total_completed_and_stored=400000.0,
        retainage_percentage=10.0,
        previous_certificates_usd=250000.0,
        lien_waiver_received=True
    )
    res = ProjectManagerService.certify_aia_g702_billing(req)
    assert res["retainage_withheld_usd"] == 40000.0
    assert res["total_earned_less_retainage"] == 360000.0
    assert res["current_payment_due_usd"] == 110000.0
    assert res["is_certified"] is True


def test_change_order_contingency_drawdown():
    co_approved = ChangeOrderCreateDTO(
        project_id="PROJ-01",
        pci_code="PCI-01",
        title="Unforeseen rock excavation",
        cost_impact_usd=15000.0,
        available_contingency_reserve=50000.0
    )
    res_approved = ProjectManagerService.process_change_order(co_approved)
    assert res_approved["contingency_drawdown_feasible"] is True
    assert res_approved["remaining_contingency_usd"] == 35000.0

    co_rejected = ChangeOrderCreateDTO(
        project_id="PROJ-01",
        pci_code="PCI-02",
        title="Architectural luxury spec upgrade",
        cost_impact_usd=60000.0,
        available_contingency_reserve=50000.0
    )
    res_rejected = ProjectManagerService.process_change_order(co_rejected)
    assert res_rejected["contingency_drawdown_feasible"] is False


# ============================================================================
# MODULE 6: EXECUTIVE MANAGEMENT TESTS
# ============================================================================
def test_portfolio_aggregation_and_predictive_alerts():
    p1 = PortfolioProjectSummaryDTO(
        project_id="P1",
        project_name="Highlands Luxury Estate",
        net_operating_income=450000.0,
        sales_velocity_units_per_month=4.5,
        budget_vs_actual_variance_usd=-25000.0,
        schedule_delay_days=10,
        spi=0.92,
        cpi=0.95
    )
    p2 = PortfolioProjectSummaryDTO(
        project_id="P2",
        project_name="Glen Lorne Terraces",
        net_operating_income=350000.0,
        sales_velocity_units_per_month=3.0,
        budget_vs_actual_variance_usd=-150000.0,
        schedule_delay_days=45,
        spi=0.81,  # Breaches SPI < 0.85
        cpi=0.86   # Breaches CPI < 0.90
    )
    agg = ExecutiveManagementService.aggregate_portfolio([p1, p2])
    assert agg["total_projects"] == 2
    assert agg["portfolio_noi_usd"] == 800000.0
    assert agg["high_risk_projects_count"] == 1
    assert agg["portfolio_health"] == "WARNING_ACTIONS_REQUIRED"

    alert = ExecutiveManagementService.evaluate_predictive_risk(0.86, 0.81, 7)
    assert alert.is_risk_flagged is True
    assert len(alert.risk_factors) == 3


# ============================================================================
# MODULE 7: FINANCE & ACCOUNTING TESTS
# ============================================================================
def test_multi_currency_fx_and_cam():
    fx = MultiCurrencyFxConversionDTO(
        amount=100000.0,
        source_currency="USD",
        target_currency="ZWG",
        book_exchange_rate=25.0,
        spot_exchange_rate=27.5
    )
    fx_res = FinanceAccountingService.calculate_fx_gain_loss(fx)
    assert fx_res["gain_loss_amount"] == 250000.0
    assert fx_res["position"] == "GAIN"

    cam = CamReconciliationDTO(
        total_building_cam_expenses_usd=100000.0,
        building_total_rentable_sqft=50000.0,
        tenants=[
            {"tenant_id": "T-01", "leased_sqft": 20000.0, "paid_prepayments_usd": 35000.0},
            {"tenant_id": "T-02", "leased_sqft": 30000.0, "paid_prepayments_usd": 65000.0}
        ]
    )
    cam_res = FinanceAccountingService.reconcile_cam_expenses(cam)
    # T1 share = 40% = 40,000 -> balance = 40,000 - 35,000 = +5,000
    assert cam_res["allocations"][0]["allocated_cam_usd"] == 40000.0
    assert cam_res["allocations"][0]["reconciliation_balance_usd"] == 5000.0
    # T2 share = 60% = 60,000 -> balance = 60,000 - 65,000 = -5,000 (credit)
    assert cam_res["allocations"][1]["allocated_cam_usd"] == 60000.0
    assert cam_res["allocations"][1]["reconciliation_balance_usd"] == -5000.0


# ============================================================================
# MODULE 8: MARKETING TESTS
# ============================================================================
def test_lead_attribution_and_campaign_romi():
    lead = LeadWebhookDTO(
        lead_source="Property24",
        campaign_name="Q4 Estate Launch",
        contact_name="Tinashe Mutasa",
        contact_email="tinashe@enterprise.co.zw",
        contact_phone="+263772123456",
        budget_usd=120000.0,
        preferred_zoning="Residential High-Density"
    )
    routed = MarketingService.score_and_route_lead(lead, ["agent_1@erp.com", "agent_2@erp.com"])
    assert routed["qualification_score"] >= 80
    assert routed["tier"] == "HOT"

    camp = CampaignPerformanceDTO(
        campaign_id="CAMP-01",
        channel_name="Google Ads",
        total_marketing_spend_usd=10000.0,
        total_leads_acquired=50,
        total_deals_closed=4,
        gross_revenue_closed_usd=400000.0
    )
    romi = MarketingService.calculate_campaign_romi(camp)
    assert romi["cost_per_acquisition_cpa_usd"] == 2500.0
    assert romi["return_on_marketing_investment_romi_pct"] == 3900.0


# ============================================================================
# MODULE 9: HR & PAYROLL TESTS
# ============================================================================
def test_geofenced_checkin_and_payroll():
    # Site Centroid at -17.824858, 31.053028
    checkin_valid = MobileGeofencedCheckInDTO(
        worker_id="WRK-101",
        project_id="PROJ-01",
        cost_code_id="CC-01",
        check_in_time=datetime.now(timezone.utc),
        check_out_time=datetime.now(timezone.utc),
        check_in_lat=-17.824900,
        check_in_lon=31.053050,  # ~6 meters away
        site_centroid_lat=-17.824858,
        site_centroid_lon=31.053028,
        geofence_radius_meters=100.0,
        worker_cert_expiry_date=date(2027, 12, 31)
    )
    check_res = HrPayrollService.verify_geofenced_check_in(checkin_valid)
    assert check_res["check_in_authorized"] is True
    assert check_res["distance_meters"] < 20.0

    payroll = SiteWorkerPayrollDTO(
        worker_id="WRK-101",
        standard_hours=40.0,
        overtime_hours=10.0,
        base_hourly_rate_usd=20.0,
        overtime_multiplier=1.5,
        tax_withholding_pct=15.0,
        statutory_levy_pct=3.0
    )
    pay_res = HrPayrollService.calculate_payroll(payroll)
    # Regular = 800, Overtime = 10 * 20 * 1.5 = 300 -> Gross = 1100
    assert pay_res["gross_pay_usd"] == 1100.0
    assert pay_res["tax_withheld_usd"] == 165.0
    assert pay_res["statutory_levy_usd"] == 33.0
    assert pay_res["net_pay_usd"] == 902.0


# ============================================================================
# MODULE 10: OPERATIONS TESTS
# ============================================================================
def test_three_way_procurement_and_plant_equipment():
    match_req = ThreeWayMatchVerificationDTO(
        po_number="PO-991",
        po_quantity=500.0,
        po_unit_price_usd=15.0,
        po_total_usd=7500.0,
        delivery_note_number="DN-881",
        delivered_quantity=500.0,
        delivery_gps_lat=-17.824858,
        delivery_gps_lon=31.053028,
        site_expected_lat=-17.824860,
        site_expected_lon=31.053030,
        vendor_invoice_number="INV-771",
        invoiced_quantity=500.0,
        invoiced_unit_price_usd=15.0,
        invoiced_total_usd=7500.0
    )
    match_res = OperationsService.verify_three_way_match(match_req)
    assert match_res["match_status"] == "MATCHED"
    assert match_res["payment_clearance_approved"] is True

    plant_req = PlantAssetUsageDTO(
        asset_tag="EXC-CAT-320",
        hours_worked=8.0,
        fuel_liters_consumed=96.0,
        hourly_hire_rate_usd=85.0,
        current_odometer_hours=245.0,
        preventive_maintenance_threshold_hours=250.0
    )
    plant_res = OperationsService.log_plant_equipment_utilization(plant_req)
    assert plant_res["job_site_hire_charge_usd"] == 680.0
    assert plant_res["new_cumulative_hours"] == 253.0
    assert plant_res["maintenance_due"] is True
    assert plant_res["maintenance_status"] == "MAINTENANCE_OVERDUE"


# ============================================================================
# API CONTROLLER INTEGRATION TESTS (TestClient)
# ============================================================================
def test_api_endpoints_integration(client):
    # Health
    h_resp = client.get("/health")
    assert h_resp.status_code == 200
    assert h_resp.json()["status"] == "HEALTHY"

    # Module 1 Proforma endpoint
    p_resp = client.post(
        "/api/v1/erp/land-developer/proforma-rlv",
        headers={"X-User-Role": "LAND_DEVELOPER"},
        json={
            "gross_realization_value": 2000000.0,
            "hard_costs": 1000000.0,
            "soft_costs": 200000.0,
            "finance_costs": 100000.0,
            "target_developer_margin_pct": 20.0,
            "margin_basis": "ON_GRV"
        }
    )
    assert p_resp.status_code == 200
    assert p_resp.json()["residual_land_value"] == 300000.0

    # Module 5 EVM endpoint
    evm_resp = client.post(
        "/api/v1/erp/project-manager/calculate-evm",
        headers={"X-User-Role": "PROJECT_MANAGER"},
        json={
            "planned_value_pv": 50000.0,
            "earned_value_ev": 45000.0,
            "actual_cost_ac": 48000.0
        }
    )
    assert evm_resp.status_code == 200
    assert evm_resp.json()["schedule_variance_sv"] == -5000.0

    # RBAC Unauthorized check
    unauth_resp = client.post(
        "/api/v1/erp/land-developer/proforma-rlv",
        headers={"X-User-Role": "CIVIL_ENGINEER"},
        json={
            "gross_realization_value": 2000000.0,
            "hard_costs": 1000000.0,
            "soft_costs": 200000.0,
            "finance_costs": 100000.0,
            "target_developer_margin_pct": 20.0
        }
    )
    assert unauth_resp.status_code == 403


def test_async_background_jobs(client):
    import time
    # Test Enqueueing pro-forma stress calculation
    enqueue_resp = client.post(
        "/api/v1/erp/jobs/enqueue",
        json={
            "task_name": "CALCULATE_PROFORMA_STRESS",
            "payload": {
                "base_request": {
                    "gross_realization_value": 3000000.0,
                    "hard_costs": 1500000.0,
                    "soft_costs": 300000.0,
                    "finance_costs": 150000.0,
                    "target_developer_margin_pct": 15.0
                },
                "cost_variation_pcts": [-10.0, 10.0],
                "lease_up_speed_factors": [1.0],
                "exit_cap_rates": [0.08]
            }
        }
    )
    assert enqueue_resp.status_code == 200
    job_id = enqueue_resp.json()["job_id"]
    assert job_id.startswith("job-")

    # Allow worker thread to execute
    time.sleep(0.5)

    status_resp = client.get(f"/api/v1/erp/jobs/{job_id}/status")
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["status"] in ["PROCESSING", "COMPLETED"]
    if data["status"] == "COMPLETED":
        assert data["result"]["scenarios_calculated"] == 2

