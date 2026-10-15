import pytest
from spatial.transformer import SpatialTransformer

def test_lo_polygon_to_geojson_standard():
    transformer = SpatialTransformer()
    # A simple square
    yx_points = [
        (0.0, 0.0),
        (0.0, 100.0),
        (100.0, 100.0),
        (100.0, 0.0),
        (0.0, 0.0) # Closed ring
    ]
    props = {"name": "Test Polygon"}
    geojson = transformer.lo_polygon_to_geojson(yx_points, props)

    assert geojson["type"] == "Feature"
    assert geojson["properties"] == props
    assert geojson["geometry"]["type"] == "Polygon"
    coords = geojson["geometry"]["coordinates"][0]

    # 5 points in a closed ring
    assert len(coords) == 5
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_unclosed_ring():
    transformer = SpatialTransformer()
    # A simple square, unclosed
    yx_points = [
        (0.0, 0.0),
        (0.0, 100.0),
        (100.0, 100.0),
        (100.0, 0.0)
    ]
    geojson = transformer.lo_polygon_to_geojson(yx_points)

    assert geojson["type"] == "Feature"
    assert geojson["properties"] == {}
    assert geojson["geometry"]["type"] == "Polygon"
    coords = geojson["geometry"]["coordinates"][0]

    # Should automatically close the ring, so 5 points
    assert len(coords) == 5
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_empty():
    transformer = SpatialTransformer()
    yx_points = []
    geojson = transformer.lo_polygon_to_geojson(yx_points)

    assert geojson["type"] == "Feature"
    assert geojson["properties"] == {}
    assert geojson["geometry"]["type"] == "Polygon"
    assert geojson["geometry"]["coordinates"] == [[]]
