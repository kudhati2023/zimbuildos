import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator

def test_validate_wetland_buffer_compliant():
    # Setup
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0,0) to (50,50)
    parcel = Polygon([(0, 0), (50, 0), (50, 50), (0, 50)])

    # Wetland is far away at (200, 200)
    wetland = Point(200, 200)

    # Execute
    result = validator.validate_wetland_buffer(parcel, [wetland])

    # Assert
    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_validate_wetland_buffer_non_compliant():
    # Setup
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0,0) to (50,50)
    parcel = Polygon([(0, 0), (50, 0), (50, 50), (0, 50)])

    # Wetland is close, at (120, 0).
    # Distance from parcel (50,0) is 70m, which is < 100m.
    wetland = Point(120, 0)

    # Execute
    result = validator.validate_wetland_buffer(parcel, [wetland])

    # Assert
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["actual_distance_m"] == 70.0
    assert violation["required_buffer_m"] == 100.0
    assert violation["encroachment_m"] == 30.0

def test_validate_wetland_buffer_multiple_wetlands():
    # Setup
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0,0) to (50,50)
    parcel = Polygon([(0, 0), (50, 0), (50, 50), (0, 50)])

    # One wetland far, one wetland close, one wetland intersecting
    wetland1 = Point(500, 500) # Far, > 100m distance
    wetland2 = Point(80, 0) # Close, 30m distance (50 to 80)
    wetland3 = Polygon([(10, 10), (20, 10), (20, 20), (10, 20)]) # Inside parcel, 0m distance

    # Execute
    result = validator.validate_wetland_buffer(parcel, [wetland1, wetland2, wetland3])

    # Assert
    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 2

    # Check violation for wetland2
    v1 = result["violations"][0]
    assert v1["wetland_index"] == 1
    assert v1["actual_distance_m"] == 30.0
    assert v1["encroachment_m"] == 70.0

    # Check violation for wetland3
    v2 = result["violations"][1]
    assert v2["wetland_index"] == 2
    assert v2["actual_distance_m"] == 0.0
    assert v2["encroachment_m"] == 100.0
