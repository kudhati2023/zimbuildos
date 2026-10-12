import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator

def test_validate_wetland_buffer_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # A 50x50 parcel at origin
    parcel = Polygon([(0, 0), (0, 50), (50, 50), (50, 0)])

    # Wetland is far away (distance 250 in x, 250 in y)
    wetland = Point(300, 300)

    res = validator.validate_wetland_buffer(parcel, [wetland])
    assert res["compliant"] is True
    assert res["status"] == "APPROVED"
    assert len(res["violations"]) == 0

def test_validate_wetland_buffer_non_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    # A 50x50 parcel at origin
    parcel = Polygon([(0, 0), (0, 50), (50, 50), (50, 0)])

    # Wetland is close (distance ~70.7)
    wetland = Point(100, 100)

    res = validator.validate_wetland_buffer(parcel, [wetland])
    assert res["compliant"] is False
    assert res["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(res["violations"]) == 1

    violation = res["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["actual_distance_m"] == 70.71
    assert violation["required_buffer_m"] == 100.0
    assert violation["encroachment_m"] == 29.29

def test_validate_wetland_buffer_multiple_wetlands():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    parcel = Polygon([(0, 0), (0, 50), (50, 50), (50, 0)])

    # Wetland 1: close (distance 10)
    wetland_1 = Point(60, 25)
    # Wetland 2: far (distance 200)
    wetland_2 = Point(250, 25)
    # Wetland 3: close (distance 0 - overlapping)
    wetland_3 = Point(25, 25)

    res = validator.validate_wetland_buffer(parcel, [wetland_1, wetland_2, wetland_3])
    assert res["compliant"] is False
    assert len(res["violations"]) == 2

    # Wetland 1 violation
    v1 = next(v for v in res["violations"] if v["wetland_index"] == 0)
    assert v1["actual_distance_m"] == 10.0
    assert v1["encroachment_m"] == 90.0

    # Wetland 3 violation
    v3 = next(v for v in res["violations"] if v["wetland_index"] == 2)
    assert v3["actual_distance_m"] == 0.0
    assert v3["encroachment_m"] == 100.0
