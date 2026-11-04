import pytest
from src.civil.earthwork_engine import CivilEngine

def test_calculate_cut_fill_excess():
    engine = CivilEngine()
    result = engine.calculate_cut_fill(area_sqm=100.0, avg_cut_depth_m=2.0, avg_fill_height_m=1.0)

    assert result["cut_volume_m3"] == 200.0
    assert result["fill_volume_m3"] == 100.0
    assert result["net_balance_m3"] == 100.0
    assert result["balance_status"] == "EXCESS_CUT (EXPORT)"

def test_calculate_cut_fill_deficit():
    engine = CivilEngine()
    result = engine.calculate_cut_fill(area_sqm=100.0, avg_cut_depth_m=1.0, avg_fill_height_m=2.0)

    assert result["cut_volume_m3"] == 100.0
    assert result["fill_volume_m3"] == 200.0
    assert result["net_balance_m3"] == -100.0
    assert result["balance_status"] == "DEFICIT (BORROW_REQUIRED)"

def test_calculate_cut_fill_balance():
    engine = CivilEngine()
    result = engine.calculate_cut_fill(area_sqm=100.0, avg_cut_depth_m=1.5, avg_fill_height_m=1.5)

    assert result["cut_volume_m3"] == 150.0
    assert result["fill_volume_m3"] == 150.0
    assert result["net_balance_m3"] == 0.0
    assert result["balance_status"] == "DEFICIT (BORROW_REQUIRED)" # The condition is > 0 for EXCESS, otherwise DEFICIT

def test_calculate_cut_fill_zero_area():
    engine = CivilEngine()
    result = engine.calculate_cut_fill(area_sqm=0.0, avg_cut_depth_m=1.0, avg_fill_height_m=1.0)

    assert result["cut_volume_m3"] == 0.0
    assert result["fill_volume_m3"] == 0.0
    assert result["net_balance_m3"] == 0.0
    assert result["balance_status"] == "DEFICIT (BORROW_REQUIRED)"
