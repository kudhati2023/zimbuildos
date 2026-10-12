import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator

def test_wetland_buffer_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is a 10x10 square at origin
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland is far away (> 100m)
    # Point at (200, 200) has distance > 100m from the parcel
    wetland = Point(200, 200)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_wetland_buffer_non_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is a 10x10 square at origin
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland is within 100m.
    # Point at (20, 0) has distance 10 from the parcel
    wetland = Point(20, 0)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["actual_distance_m"] == 10.0
    assert violation["required_buffer_m"] == 100.0
    assert violation["encroachment_m"] == 90.0

def test_multiple_wetlands():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is a 10x10 square at origin
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland 0: compliant (far away)
    w0 = Point(200, 200)

    # Wetland 1: non-compliant (distance 50)
    w1 = Point(60, 0)

    # Wetland 2: non-compliant (inside the parcel, distance 0)
    w2 = Polygon([(2, 2), (4, 2), (4, 4), (2, 4)])

    result = validator.validate_wetland_buffer(parcel, [w0, w1, w2])

    assert result["compliant"] is False
    assert len(result["violations"]) == 2

    # Check violation for w1
    v1 = next(v for v in result["violations"] if v["wetland_index"] == 1)
    assert v1["actual_distance_m"] == 50.0
    assert v1["encroachment_m"] == 50.0

    # Check violation for w2
    v2 = next(v for v in result["violations"] if v["wetland_index"] == 2)
    assert v2["actual_distance_m"] == 0.0
    assert v2["encroachment_m"] == 100.0
# testing
