import pytest
from spatial.transformer import SpatialTransformer

def test_lo_polygon_to_geojson_closed_ring():
    transformer = SpatialTransformer()
    # Mocking transform_lo_to_wgs84 for predictable testing
    transformer.transform_lo_to_wgs84 = lambda y, x: (x, y) # Dummy implementation

    yx_points = [(1.0, 2.0), (3.0, 4.0), (5.0, 6.0), (1.0, 2.0)]
    properties = {"name": "test_polygon"}

    result = transformer.lo_polygon_to_geojson(yx_points, properties)

    assert result["type"] == "Feature"
    assert result["properties"] == {"name": "test_polygon"}
    assert result["geometry"]["type"] == "Polygon"
    assert result["geometry"]["coordinates"] == [[[2.0, 1.0], [4.0, 3.0], [6.0, 5.0], [2.0, 1.0]]]

def test_lo_polygon_to_geojson_unclosed_ring():
    transformer = SpatialTransformer()
    transformer.transform_lo_to_wgs84 = lambda y, x: (x, y)

    yx_points = [(1.0, 2.0), (3.0, 4.0), (5.0, 6.0)]

    result = transformer.lo_polygon_to_geojson(yx_points)

    assert result["geometry"]["coordinates"] == [[[2.0, 1.0], [4.0, 3.0], [6.0, 5.0], [2.0, 1.0]]]
    assert result["properties"] == {}

def test_lo_polygon_to_geojson_empty_points():
    transformer = SpatialTransformer()

    result = transformer.lo_polygon_to_geojson([])

    assert result["geometry"]["coordinates"] == [[]]
    assert result["properties"] == {}

def test_lo_polygon_to_geojson_single_point():
    transformer = SpatialTransformer()
    transformer.transform_lo_to_wgs84 = lambda y, x: (x, y)

    result = transformer.lo_polygon_to_geojson([(1.0, 2.0)])

    # Should still auto-close (in a degenerate sense)
    assert result["geometry"]["coordinates"] == [[[2.0, 1.0]]]
