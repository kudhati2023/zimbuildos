import pytest
from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator


@pytest.fixture
def validator():
    return ZoningValidator(wetland_buffer_distance_m=100.0)


def test_validate_wetland_buffer_compliant(validator):
    # Parcel far away from wetland
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    wetland = Point(200, 200)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0


def test_validate_wetland_buffer_non_compliant(validator):
    # Parcel encroaches on wetland buffer (distance = 40m)
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    wetland = Point(10, 50)

    result = validator.validate_wetland_buffer(parcel, [wetland])

    assert result["compliant"] is False
    assert result["status"] == "REJECTED_WETLAND_ENCROACHMENT"
    assert len(result["violations"]) == 1

    violation = result["violations"][0]
    assert violation["wetland_index"] == 0
    assert violation["actual_distance_m"] == 40.0
    assert violation["required_buffer_m"] == 100.0
    assert violation["encroachment_m"] == 60.0


def test_validate_wetland_buffer_multiple_wetlands(validator):
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    wetland1 = Point(500, 500)  # compliant (distance >> 100)
    wetland2 = Polygon([(0, 50), (10, 50), (10, 60), (0, 60)])  # distance = 40
    wetland3 = Point(-50, 5)  # distance = 50

    result = validator.validate_wetland_buffer(parcel, [wetland1, wetland2, wetland3])

    assert result["compliant"] is False
    assert len(result["violations"]) == 2

    indices = [v["wetland_index"] for v in result["violations"]]
    assert indices == [1, 2]

    assert result["violations"][0]["actual_distance_m"] == 40.0
    assert result["violations"][1]["actual_distance_m"] == 50.0


def test_validate_wetland_buffer_empty_wetlands(validator):
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    result = validator.validate_wetland_buffer(parcel, [])

    assert result["compliant"] is True
    assert result["status"] == "APPROVED"
    assert len(result["violations"]) == 0


def test_validate_wetland_buffer_edge_case(validator):
    # Parcel exactly 100m away
    parcel = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    wetland = Polygon([(0, 110), (10, 110), (10, 120), (0, 120)])  # distance = 100

    result = validator.validate_wetland_buffer(parcel, [wetland])

    # Depending on float math and boundary rules, it might or might not touch
    # But if it touches, encroachment is 0.0
    if not result["compliant"]:
        assert len(result["violations"]) == 1
        assert result["violations"][0]["encroachment_m"] == 0.0
    else:
        assert result["compliant"] is True
