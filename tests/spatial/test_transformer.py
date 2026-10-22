import pytest
from spatial.transformer import SpatialTransformer

def test_transform_lo_to_wgs84():
    transformer = SpatialTransformer()
    lon, lat = transformer.transform_lo_to_wgs84(82000.0, 1980000.0)
    # Basic sanity check that it returns coordinates in valid WGS84 range
    assert isinstance(lon, float)
    assert isinstance(lat, float)
    assert -180 <= lon <= 180
    assert -90 <= lat <= 90

def test_lo_polygon_to_geojson():
    transformer = SpatialTransformer()
    # Provide a simple square
    yx_points = [
        (82000.0, 1980000.0),
        (82100.0, 1980000.0),
        (82100.0, 1980100.0),
        (82000.0, 1980100.0)
    ]
    props = {"id": "STAND-123"}
    geojson = transformer.lo_polygon_to_geojson(yx_points, props)

    assert geojson["type"] == "Feature"
    assert geojson["properties"] == props
    assert geojson["geometry"]["type"] == "Polygon"

    coords = geojson["geometry"]["coordinates"][0]
    # Check it auto-closed the ring
    assert len(coords) == 5
    assert coords[0] == coords[-1]

    # Check each coordinate pair is a pair of floats
    for point in coords:
        assert len(point) == 2
        assert isinstance(point[0], float)
        assert isinstance(point[1], float)

def test_lo_polygon_to_geojson_already_closed():
    transformer = SpatialTransformer()
    # Provide an already closed ring
    yx_points = [
        (82000.0, 1980000.0),
        (82100.0, 1980000.0),
        (82100.0, 1980100.0),
        (82000.0, 1980100.0),
        (82000.0, 1980000.0)
    ]
    geojson = transformer.lo_polygon_to_geojson(yx_points)

    coords = geojson["geometry"]["coordinates"][0]
    # Should not add another point since it's already closed
    assert len(coords) == 5
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_empty():
    transformer = SpatialTransformer()
    geojson = transformer.lo_polygon_to_geojson([])

    assert geojson["type"] == "Feature"
    assert geojson["properties"] == {}
    assert geojson["geometry"]["type"] == "Polygon"
    assert geojson["geometry"]["coordinates"] == [[]]

def test_lo_polygon_to_geojson_no_properties():
    transformer = SpatialTransformer()
    yx_points = [(82000.0, 1980000.0)]
    geojson = transformer.lo_polygon_to_geojson(yx_points)

    assert geojson["properties"] == {}

def test_lo_polygon_to_geojson_with_custom_properties():
    transformer = SpatialTransformer()
    yx_points = [
        (82000.0, 1980000.0),
        (82100.0, 1980000.0),
        (82100.0, 1980100.0)
    ]
    props = {"owner": "Alice", "zone": "residential"}
    geojson = transformer.lo_polygon_to_geojson(yx_points, properties=props)

    assert geojson["properties"] == props
    assert geojson["properties"]["owner"] == "Alice"
    assert geojson["properties"]["zone"] == "residential"
