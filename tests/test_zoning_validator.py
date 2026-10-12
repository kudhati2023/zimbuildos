import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator

def test_compliant_parcel():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # Parcel at (0,0) to (10,10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    # Wetland far away at (200, 200)
    wetland = Point(200, 200)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_intersecting_buffer():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # Parcel at (0,0) to (10,10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    # Wetland at (50, 50). Distance to (10,10) is sqrt(40^2 + 40^2) = sqrt(3200) ≈ 56.57 < 100
    wetland = Point(50, 50)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["required_buffer_m"] == 100.0
    assert "actual_distance_m" in violation
    assert "encroachment_m" in violation
    # Distance from (10,10) to (50,50) is ~56.57
    assert 56.5 < violation["actual_distance_m"] < 56.6
    assert 43.4 < violation["encroachment_m"] < 43.5

def test_empty_wetlands():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    result = validator.validate_wetland_buffer(parcel, [])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_intersecting_polygon_wetland():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # Parcel at (0,0) to (10,10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    # Wetland is a polygon from (20,20) to (30,30)
    wetland = Polygon([(20, 20), (30, 20), (30, 30), (20, 30)])

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    # Distance from (10,10) to (20,20) is sqrt(10^2 + 10^2) = sqrt(200) ≈ 14.14
    assert 14.1 < violation["actual_distance_m"] < 14.2
