import pytest
from contracts.agreement_of_sale import LandSalesManager
from src.civil.earthwork_engine import CivilEngine

def test_agreement_of_sale_generation():
    mgr = LandSalesManager(fx_rate=26.50)
    res = mgr.generate_agreement_of_sale(
        stand_id="STAND-002",
        area_sqm=3000.0,
        zoning="HIGH_RISE",
        buyer_name="Tendai Mupfumira",
        buyer_id="63-1992014-G-22",
        buyer_address="14 Enterprise Road, Harare",
        buyer_phone="+263 77 212 3456",
        purchase_price_usd=8500.0,
        deposit_paid_usd=2000.0,
        payment_terms="20% deposit, balance in 12 monthly installments"
    )
    assert res["status"] == "EXECUTED"
    assert res["balance_usd"] == 6500.0
    assert res["price_zwg"] == 8500.0 * 26.50
    assert "Dr. Tinashe Manzungu" in res["contract_markdown"]
    assert "STAND-002" in res["contract_markdown"]

def test_civil_infrastructure_boq():
    engine = CivilEngine(fx_rate_zwg_to_usd=26.50)
    boq = engine.generate_infrastructure_boq(road_length_m=480.0, sewer_length_m=420.0, water_length_m=450.0)
    assert len(boq) == 6
    total_boq_usd = sum(item["total_usd"] for item in boq)
    assert total_boq_usd > 50000.0

def test_civil_stormwater_drain_design():
    engine = CivilEngine()

    # Test scouring flow
    res = engine.design_stormwater_drain(bottom_width_m=1.0, water_depth_m=0.5, side_slope=2.0, bed_slope=0.01)
    assert res == {'flow_capacity_m3_s': 3.047, 'flow_velocity_m_s': 3.05, 'cross_section_area_m2': 1.0, 'is_non_scouring': False}

    # Test non-scouring flow
    res = engine.design_stormwater_drain(bottom_width_m=1.0, water_depth_m=0.5, side_slope=2.0, bed_slope=0.001)
    assert res == {'flow_capacity_m3_s': 0.964, 'flow_velocity_m_s': 0.96, 'cross_section_area_m2': 1.0, 'is_non_scouring': True}

    # Test zero depth
    res = engine.design_stormwater_drain(bottom_width_m=1.0, water_depth_m=0.0, side_slope=2.0, bed_slope=0.01)
    assert res == {'flow_capacity_m3_s': 0.0, 'flow_velocity_m_s': 0, 'cross_section_area_m2': 0.0, 'is_non_scouring': True}
