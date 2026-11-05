import pytest
from src.erp.fleet_appraisal_manager import FleetAsset, AssetCategory, AssetStatus

def test_hours_until_next_service():
    asset = FleetAsset(
        asset_id="FA-001",
        asset_name="Bulldozer 1",
        category=AssetCategory.HEAVY_EARTHMOVING.value,
        reg_or_fleet_no="B01",
        vin_or_engine_no="VIN001",
        year=2020,
        acquisition_cost_usd=100000.0,
        salvage_value_usd=10000.0,
        useful_life_years=10,
        rated_life_hours=10000.0,
        current_operating_hours=3600.0,
        current_odometer_km=0.0,
        current_site_location="Site A",
        assigned_operator="John Doe",
        last_service_hours=3500.0,
        service_interval_hours=250.0
    )

    # next_service = 3500.0 + 250.0 = 3750.0
    # expected: 3750.0 - 3600.0 = 150.0
    assert asset.hours_until_next_service == 150.0
    assert asset.is_service_due is False

    # Overdue service
    asset.current_operating_hours = 3800.0
    # expected: max(0.0, 3750.0 - 3800.0) = 0.0
    assert asset.hours_until_next_service == 0.0
    assert asset.is_service_due is True

    # Needs service soon
    asset.current_operating_hours = 3740.0
    # expected: 3750.0 - 3740.0 = 10.0
    assert asset.hours_until_next_service == 10.0
    assert asset.is_service_due is True
