import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator

def test_validate_wetland_buffer_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0, 0) to (10, 10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland is far away, clearly > 100m distance (start at x=200)
    wetland = Polygon([(200, 0), (210, 0), (210, 10), (200, 10)])

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_validate_wetland_buffer_empty_wetlands():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    result = validator.validate_wetland_buffer(parcel, [])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0

def test_validate_wetland_buffer_non_compliant():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0, 0) to (10, 10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland is close, distance is ~40m (start at x=50)
    wetland = Polygon([(50, 0), (60, 0), (60, 10), (50, 10)])

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["actual_distance_m"] == 40.0
    assert violation["required_buffer_m"] == 100.0
    assert violation["encroachment_m"] == 60.0

def test_validate_wetland_buffer_point():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0, 0) to (10, 10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland is a point close to parcel (x=50, y=5)
    wetland = Point(50, 5)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1
    assert result["violations"][0]["actual_distance_m"] == 40.0

def test_validate_wetland_buffer_multiple_wetlands():
    validator = ZoningValidator(wetland_buffer_distance_m=100.0)

    # Parcel is at (0, 0) to (10, 10)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    # Wetland 1 is far (compliant)
    wetland1 = Polygon([(200, 0), (210, 0), (210, 10), (200, 10)])

    # Wetland 2 is close (non-compliant, distance ~40m)
    wetland2 = Polygon([(50, 0), (60, 0), (60, 10), (50, 10)])

    # Wetland 3 is very close (non-compliant, distance ~10m)
    wetland3 = Polygon([(-20, 0), (-10, 0), (-10, 10), (-20, 10)])

    result = validator.validate_wetland_buffer(parcel, [wetland1, wetland2, wetland3])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 2

    assert result["violations"][0]["wetland_index"] == 1
    assert result["violations"][1]["wetland_index"] == 2

def test_validate_densification_quota_compliant():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=450.0, total_residential_area_m2=1000.0)

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert result["high_rise_ratio"] == 0.45

def test_validate_densification_quota_non_compliant():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=350.0, total_residential_area_m2=1000.0)

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert result["high_rise_ratio"] == 0.35

def test_validate_densification_quota_zero_total_area():
    validator = ZoningValidator(high_rise_min_ratio=0.40)
    result = validator.validate_densification_quota(high_rise_area_m2=0.0, total_residential_area_m2=0.0)

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_BELOW_DENSIFICATION_MANDATE"
    assert result["high_rise_ratio"] == 0.0
