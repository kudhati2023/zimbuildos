"""
Unit tests for Zimbuild Real Estate & Construction ERP Core Functions & Optimization Engines
"""

import pytest
from src.erp.portfolio_manager import PortfolioManager, PropertyAsset, UnitConfig
from src.erp.lease_tenant_manager import LeaseTenantManager
from src.erp.job_costing_tender import JobCostingTenderManager, SubcontractorBid
from src.erp.site_operations import SiteOperationsManager, ProcurementOrder
from src.erp.financial_tax_engine import FinancialTaxEngine
from src.erp.dlap_registry_engine import DLAPRegistryEngine
from src.erp.lean_toc_engine import LeanTOCEngine


def test_portfolio_management_and_noi():
    pm = PortfolioManager()
    summary = pm.get_portfolio_summary()
    assert summary["total_assets"] >= 3
    assert summary["total_valuation_usd"] > 6000000.0
    assert summary["portfolio_occupancy_rate_pct"] > 0
    assert summary["portfolio_net_operating_income_usd"] > 0
    
    # Test depreciation calculation
    p1 = pm.properties["PROP-HRE-001"]
    depr = p1.calculate_annual_depreciation(2026)
    assert depr["annual_depreciation"] > 0
    assert depr["net_book_value"] > 0
    assert p1.average_rent_per_sqft > 0


def test_lease_automation_and_tenant_crm():
    lm = LeaseTenantManager()
    
    # Screening logic test
    t_approved = lm.screen_tenant("Tendai Moyo", "63-123456-A-12", 5000.0, 1000.0)
    assert t_approved.credit_status == "Approved"
    assert t_approved.credit_score == 780
    
    t_rejected = lm.screen_tenant("John LowIncome", "63-000000-Z-00", 1200.0, 1000.0)
    assert t_rejected.credit_status == "Rejected"
    
    # Escalation and abstraction
    lease = lm.leases["LSE-001"]
    escalation = lease.calculate_next_escalation()
    assert escalation["annual_escalated_rent_usd"] > lease.current_rent_usd
    
    abstraction = lease.generate_lease_abstraction("Parkview Heights", "Stanbic Bank")
    assert "lease_reference" in abstraction
    assert abstraction["security_deposit_held"] == 5600.0
    
    # Maintenance ticket
    ticket = lm.submit_maintenance_ticket(t_approved.tenant_id, "PROP-HRE-001", "U-PV-01", "Electrical", "Air conditioner power trip")
    assert ticket.ticket_id.startswith("TKT-")
    assert ticket.status == "Open"


def test_job_costing_tender_and_retention():
    jm = JobCostingTenderManager()
    summary = jm.get_job_costing_summary()
    assert summary["budget_at_completion_usd"] > 0
    assert summary["project_cpi"] > 0
    
    # Tender evaluation ranking
    ranked_bids = jm.evaluate_tender_package("PKG-ELEC-01")
    assert len(ranked_bids) == 3
    # Top ranked bid should have highest composite score
    assert ranked_bids[0]["score"] >= ranked_bids[1]["score"]
    
    # Payment application certification with 10% retention
    cert = jm.certify_payment_application("PAY-APP-101", certified_amount=15000.0, variations=500.0)
    assert cert.retention_rate_pct == 10.0
    assert cert.retention_withheld_usd == 1500.0  # 10% of 15,000
    assert cert.net_payable_amount_usd == 15000.0 - 1500.0 + 500.0  # 14,000


def test_site_operations_three_way_match_and_plant():
    sm = SiteOperationsManager()
    
    # Three-way matching test
    po = ProcurementOrder(
        po_id="PO-TEST-01",
        requisition_id="REQ-TEST",
        supplier_name="PPC Zimbabwe",
        item_description="Cement 42.5N",
        ordered_quantity=100.0,
        unit_price_usd=10.0,
        unit_of_measure="Bags"
    )
    # 1. Verify site delivery with photo & receiver
    po.verify_delivery(100.0, "Site Foreman J. Moyo", "sample_photo_bytes")
    assert po.delivery_status == "Delivered"
    assert po.delivery_photo_hash is not None
    
    # 2. Match with supplier invoice
    match_result = po.execute_three_way_match("INV-PPC-001", 1000.0)
    assert match_result["three_way_match_passed"] is True
    assert match_result["variance_usd"] == 0.0
    
    # Plant machinery telematics
    kpis = sm.get_operations_kpi()
    assert kpis["total_fleet_operating_hours"] > 0
    assert kpis["total_fleet_fuel_liters"] > 0
    cat = sm.equipment_fleet["PLANT-01"]
    assert cat.average_fuel_burn_liters_per_hour > 0
    assert cat.utilization_rate_pct > 0


def test_financial_zimra_tax_and_cam_reconciliation():
    fe = FinancialTaxEngine(rbz_zwg_rate=26.50)
    
    # ZIMRA tax localization: VAT 15%, WHT 5% (if no ITF263), IMTT 2%
    tax_with_clearance = fe.compute_local_tax("TX-01", 10000.0, has_itf263=True, is_transfer=True)
    assert tax_with_clearance.vat_payable_usd == 1500.0
    assert tax_with_clearance.withholding_tax_usd == 0.0
    assert tax_with_clearance.imtt_tax_usd == 200.0
    
    tax_without_clearance = fe.compute_local_tax("TX-02", 10000.0, has_itf263=False, is_transfer=True)
    assert tax_without_clearance.withholding_tax_usd == 500.0  # 5% withheld
    
    # Currency conversions
    assert fe.convert_currency(100.0, "USD", "ZWG") == 2650.0
    
    # CAM Reconciliation
    cam = fe.cam_pools["PROP-HRE-001"]
    share = cam.calculate_tenant_cam_share(tenant_sqft=2200.0, cam_advance_paid_usd=8000.0)
    assert share["proportion_pct"] > 0
    assert share["actual_share_usd"] > 0
    
    # IFRS Profit & Loss statement
    pnl = fe.generate_ifrs_statement_of_profit_or_loss(
        rental_revenue=150000.0,
        construction_revenue=450000.0,
        cost_of_sales=320000.0,
        opex=85000.0
    )
    assert pnl["reporting_standard"].startswith("IFRS")
    assert pnl["gross_profit"] == 280000.0
    assert pnl["net_profit_for_period"] > 0


def test_dlap_digital_registry_and_caveat_compliance():
    dlap = DLAPRegistryEngine()
    
    # Validated deed check
    res_valid = dlap.verify_title_for_transfer("TD-4982/2021")
    assert res_valid["can_transfer_or_finance"] is True
    assert res_valid["status"] == "VALIDATED"
    
    # Encumbered deed with mortgage bond
    res_encumbered = dlap.verify_title_for_transfer("TD-1049/2023")
    assert res_encumbered["can_transfer_or_finance"] is False
    assert len(res_encumbered["mortgage_bonds"]) == 1
    
    # Place electronic caveat on deed 1
    deed1 = dlap.registry["TD-4982/2021"]
    cav_ref = deed1.register_electronic_caveat("Standard Chartered Bank", "High Court Injunction Case #HC-194/26")
    assert deed1.validation_status == "ELECTRONIC CAVEAT ACTIVE"
    
    res_after_caveat = dlap.verify_title_for_transfer("TD-4982/2021")
    assert res_after_caveat["can_transfer_or_finance"] is False
    assert res_after_caveat["has_active_caveats"] is True
    
    # Clear caveat
    deed1.clear_caveat(cav_ref)
    assert deed1.validation_status == "VALIDATED"
    assert dlap.verify_title_for_transfer("TD-4982/2021")["can_transfer_or_finance"] is True


def test_lean_construction_toc_and_offline_sync():
    lean = LeanTOCEngine()
    
    # Last Planner System (LPS) PPC metric
    ppc_report = lean.calculate_percent_plan_complete(41)
    assert ppc_report["total_tasks_promised"] == 5
    assert ppc_report["tasks_completed"] == 4
    assert ppc_report["ppc_percentage"] == 80.0
    assert "Material delay - quarry sand haulage truck breakdown" in ppc_report["delay_reasons"]
    
    # Theory of Constraints (TOC) 5 focus steps
    toc = lean.analyze_theory_of_constraints()
    assert "step_1_identify" in toc
    assert "step_4_elevate" in toc
    assert len(toc["major_cost_overrun_mitigations"]) == 5
    
    # Offline sync queue with SHA-256 tamper-evident hash
    evt = lean.enqueue_offline_event(
        device_id="MOBILE-FOREMAN-01",
        role="Site Construction Engineer",
        action="DISPATCH_MATERIAL",
        data={"stand": "412", "material": "Cement 42.5N", "qty": 50}
    )
    assert evt.synced_to_cloud is False
    assert len(evt.tamper_proof_hash) == 64  # SHA-256
    
    sync_result = lean.process_sync_queue()
    assert sync_result["synced_count"] >= 1
    assert evt.synced_to_cloud is True


def test_site_operations_log_equipment_shift():
    sm = SiteOperationsManager()

    # Happy path: log equipment shift for an existing asset
    asset_id = "PLANT-01"
    initial_eq = sm.equipment_fleet[asset_id]
    initial_op_hours = initial_eq.operating_hours
    initial_idle_hours = initial_eq.idle_downtime_hours
    initial_fuel = initial_eq.fuel_consumed_liters

    op_hours_to_add = 10.0
    idle_hours_to_add = 2.5
    fuel_to_add = 55.0

    sm.log_equipment_shift(asset_id, op_hours_to_add, idle_hours_to_add, fuel_to_add)

    updated_eq = sm.equipment_fleet[asset_id]
    assert updated_eq.operating_hours == initial_op_hours + op_hours_to_add
    assert updated_eq.idle_downtime_hours == initial_idle_hours + idle_hours_to_add
    assert updated_eq.fuel_consumed_liters == initial_fuel + fuel_to_add

    # Edge case: log equipment shift for a non-existent asset
    # This should not raise any exceptions
    sm.log_equipment_shift("NON-EXISTENT-PLANT", 5.0, 1.0, 20.0)
