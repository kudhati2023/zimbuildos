import pytest
from unittest.mock import patch
from spatial.transformer import SpatialTransformer

@pytest.fixture
def transformer():
    return SpatialTransformer()

def test_lo_polygon_to_geojson_standard(transformer):
    """
    Test standard conversion of polygon points.
    Mocks transform_lo_to_wgs84 to isolate testing of the polygon-specific logic.
    """
    points = [(10.0, 20.0), (10.0, 30.0), (20.0, 30.0), (20.0, 20.0)]

    with patch.object(transformer, 'transform_lo_to_wgs84') as mock_transform:
        # Simple mock transformation: divide by 10 for predictability
        mock_transform.side_effect = lambda y, x: (y / 10, x / 10)

        properties = {"name": "Test Polygon", "id": 123}
        result = transformer.lo_polygon_to_geojson(points, properties=properties)

        assert result["type"] == "Feature"
        assert result["properties"] == properties
        assert result["geometry"]["type"] == "Polygon"

        # Verify coordinates
        coords = result["geometry"]["coordinates"][0]
        # Should auto-close the ring, so 4 input points -> 5 output points
        assert len(coords) == 5
        assert coords[0] == [1.0, 2.0]
        assert coords[1] == [1.0, 3.0]
        assert coords[2] == [2.0, 3.0]
        assert coords[3] == [2.0, 2.0]
        assert coords[4] == [1.0, 2.0]  # The closed point

        assert mock_transform.call_count == 4

def test_lo_polygon_to_geojson_closed_ring(transformer):
    """
    Test conversion when the input is already a closed ring.
    Should not add an extra point.
    """
    points = [(10.0, 20.0), (10.0, 30.0), (20.0, 30.0), (10.0, 20.0)]

    with patch.object(transformer, 'transform_lo_to_wgs84') as mock_transform:
        mock_transform.side_effect = lambda y, x: (y / 10, x / 10)

        result = transformer.lo_polygon_to_geojson(points)

        coords = result["geometry"]["coordinates"][0]
        # 4 input points (already closed) -> 4 output points
        assert len(coords) == 4
        assert coords[0] == [1.0, 2.0]
        assert coords[-1] == [1.0, 2.0]

        # properties should default to {}
        assert result["properties"] == {}

def test_lo_polygon_to_geojson_empty(transformer):
    """
    Test conversion with empty input array.
    """
    result = transformer.lo_polygon_to_geojson([])

    assert result["type"] == "Feature"
    assert result["geometry"]["type"] == "Polygon"
    assert result["geometry"]["coordinates"] == [[]]
    assert result["properties"] == {}

def test_lo_polygon_to_geojson_none_properties(transformer):
    """
    Test conversion with explicit None for properties.
    """
    points = [(0.0, 0.0)]
    with patch.object(transformer, 'transform_lo_to_wgs84', return_value=(0.0, 0.0)):
        result = transformer.lo_polygon_to_geojson(points, properties=None)

        assert result["properties"] == {}

def test_lo_polygon_to_geojson_real_transform(transformer):
    """
    Integration-style test using the real transform_lo_to_wgs84 method.
    """
    # Just checking the structure and basic types, since actual projection
    # values might vary slightly across pyproj versions.
    points = [(0.0, 0.0), (0.0, 1000.0), (1000.0, 1000.0)]
    result = transformer.lo_polygon_to_geojson(points, properties={"test": True})

    coords = result["geometry"]["coordinates"][0]

    # 3 points in, ring should be closed to 4
    assert len(coords) == 4
    assert coords[0] == coords[-1]

    # Check that coordinate values are floats
    assert all(isinstance(c[0], float) and isinstance(c[1], float) for c in coords)
    assert result["properties"]["test"] is True
