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
        payment_terms="20% deposit, balance in 12 monthly installments",
    )
    assert res["status"] == "EXECUTED"
    assert res["balance_usd"] == 6500.0
    assert res["price_zwg"] == 8500.0 * 26.50
    assert "Dr. Tinashe Manzungu" in res["contract_markdown"]
    assert "STAND-002" in res["contract_markdown"]


def test_civil_infrastructure_boq():
    engine = CivilEngine(fx_rate_zwg_to_usd=26.50)
    boq = engine.generate_infrastructure_boq(
        road_length_m=480.0, sewer_length_m=420.0, water_length_m=450.0
    )
    assert len(boq) == 6
    total_boq_usd = sum(item["total_usd"] for item in boq)
    assert total_boq_usd > 50000.0
