"""
Unit tests for Project Engineering, Quality/HSE & Mortgage Financing Suite
"""

import pytest
from src.erp.project_engineering_suite import (
    ProjectScheduleManager,
    QualityHSEManager,
    MortgageFinancingEngine,
    MunicipalPermitManager
)


def test_project_schedule_critical_path_and_progress():
    sched = ProjectScheduleManager()
    summary = sched.get_schedule_summary()

    assert summary["total_tasks"] >= 10
    assert summary["total_duration_days"] >= 200
    assert summary["critical_path_tasks_count"] >= 5

    # Update progress on task 08
    task = sched.update_task_progress("TSK-08", 100)
    assert task.progress_pct == 100
    assert task.status == "COMPLETED"


def test_quality_hse_concrete_cube_and_snags():
    hse = QualityHSEManager()

    # Log new passing cube test
    test = hse.record_cube_test(
        pour_location="Stand 003 First Floor Slab",
        structural_element="Suspended Slab",
        mix_designation="C30",
        slump_mm=100,
        strength_7day_mpa=23.5,
        strength_28day_mpa=32.8,
        tested_by="Materials Testing Lab Harare"
    )
    assert test.passed is True
    assert test.strength_28day_mpa >= 30.0

    # Log new failing cube test (insufficient strength)
    fail_test = hse.record_cube_test(
        pour_location="Boundary Wall Footing",
        structural_element="Footing",
        mix_designation="C25",
        slump_mm=75,
        strength_7day_mpa=12.0,
        strength_28day_mpa=19.5,
        tested_by="Materials Testing Lab Harare"
    )
    assert fail_test.passed is False

    # Log and resolve a snag
    snag = hse.log_snag(
        location="Stand 001 - Living Room",
        trade="Glazing",
        description="Aluminium sliding door lock latch misaligned",
        severity="MINOR",
        photo_hash="hash_latch_photo_123",
        assigned_subcontractor="Apex Aluminium & Glazing"
    )
    assert snag.resolved is False

    resolved = hse.resolve_snag(snag.snag_id)
    assert resolved.resolved is True
    assert resolved.rectification_date is not None


def test_mortgage_financing_dual_currency():
    mort = MortgageFinancingEngine(rbz_zwg_rate=26.50)

    # Calculate $50,000 house loan with 20% down, 5-year tenure at 12%
    calc = mort.calculate_mortgage(
        property_price_usd=50000.0,
        deposit_pct=20.0,
        loan_term_years=5,
        annual_interest_rate_pct=12.0
    )

    assert calc["deposit_usd"] == 10000.0
    assert calc["loan_principal_usd"] == 40000.0
    assert calc["loan_principal_zwg"] == 40000.0 * 26.50
    assert calc["total_months"] == 60
    assert calc["monthly_installment_usd"] > 0
    assert calc["monthly_installment_zwg"] == round(calc["monthly_installment_usd"] * 26.50, 2)
    assert len(calc["amortization_preview"]) == 12


def test_municipal_permit_tracker_and_habitation_certificate():
    perm = MunicipalPermitManager()
    overview = perm.get_permit_overview()

    assert overview["total_stages"] == 6
    assert overview["stages_cleared"] == 4
    assert overview["ready_for_occupancy"] is False

    # Signoff Stage 5 (Roof Framing)
    s5 = perm.signoff_stage(5, "Building Inspector Moyo", "hash_roof_approved_982")
    assert s5.status == "PASSED"

    # Signoff Stage 6 (Final Drainage & Habitation Certificate)
    s6 = perm.signoff_stage(6, "Director of Works HCC", "hash_habitation_cert_final")
    assert s6.status == "PASSED"

    new_overview = perm.get_permit_overview()
    assert new_overview["stages_cleared"] == 6
    assert new_overview["ready_for_occupancy"] is True
