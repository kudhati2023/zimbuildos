import pytest
from src.construction.building_engine import BuildingEngine


def test_building_engine_material_boq():
    engine = BuildingEngine(fx_rate=26.50)
    res = engine.calculate_materials_boq(area_sqm=165.0, finish_tier="TURNKEY")
    assert res["area_sqm"] == 165.0
    assert res["total_cost_usd"] == 165.0 * 350.0
    assert res["total_cost_zwg"] == res["total_cost_usd"] * 26.50
    assert len(res["materials"]) == 7
    # Check bricks calculation (165 * 115 = 18975)
    bricks = next(m for m in res["materials"] if "Bricks" in m["material"])
    assert bricks["quantity"] == int(165.0 * 115)


def test_building_stages():
    engine = BuildingEngine(fx_rate=26.50)
    stages = engine.get_construction_stages(total_contract_usd=50000.0)
    assert len(stages) == 7
    total_pct = sum(s["percentage"] for s in stages)
    assert total_pct == 100
    total_val = sum(s["valuation_usd"] for s in stages)
    assert abs(total_val - 50000.0) < 1.0


def test_turnkey_contract_generation():
    engine = BuildingEngine(fx_rate=26.50)
    contract = engine.generate_turnkey_contract(
        contract_ref="ZIMBUILD-BLD-2026-001",
        client_name="Farai Mutasa",
        client_id="63-1882941-K-44",
        client_phone="+263 77 344 5566",
        stand_id="STAND-002",
        model_id="MODEL_3BED_EXECUTIVE",
        finish_tier="TURNKEY",
    )
    assert "Farai Mutasa" in contract["contract_markdown"]
    assert "Dr. Tinashe Manzungu" in contract["contract_markdown"]
    assert "STAND-002" in contract["contract_markdown"]
    assert contract["deposit_usd"] == round(contract["total_usd"] * 0.30, 2)
