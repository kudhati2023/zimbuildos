import pytest
from spatial.transformer import SpatialTransformer

def test_transform_lo_to_wgs84():
    transformer = SpatialTransformer(central_meridian=31)
    lon, lat = transformer.transform_lo_to_wgs84(y=100.0, x=100.0)
    assert isinstance(lon, float)
    assert isinstance(lat, float)

def test_lo_polygon_to_geojson_standard():
    transformer = SpatialTransformer(central_meridian=31)
    # 3 points, unclosed
    points = [(100.0, 100.0), (200.0, 100.0), (200.0, 200.0)]
    feature = transformer.lo_polygon_to_geojson(points)

    assert feature["type"] == "Feature"
    assert feature["properties"] == {}
    assert feature["geometry"]["type"] == "Polygon"

    coords = feature["geometry"]["coordinates"][0]
    assert len(coords) == 4
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_closed_ring():
    transformer = SpatialTransformer(central_meridian=31)
    # 4 points, already closed
    points = [(100.0, 100.0), (200.0, 100.0), (200.0, 200.0), (100.0, 100.0)]
    feature = transformer.lo_polygon_to_geojson(points)

    coords = feature["geometry"]["coordinates"][0]
    assert len(coords) == 4
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_empty():
    transformer = SpatialTransformer(central_meridian=31)
    feature = transformer.lo_polygon_to_geojson([])

    assert feature["type"] == "Feature"
    assert feature["properties"] == {}
    assert feature["geometry"]["type"] == "Polygon"

    coords = feature["geometry"]["coordinates"]
    assert coords == [[]]

def test_lo_polygon_to_geojson_properties():
    transformer = SpatialTransformer(central_meridian=31)
    points = [(100.0, 100.0), (200.0, 100.0), (200.0, 200.0)]
    props = {"name": "Test Polygon", "id": 123}
    feature = transformer.lo_polygon_to_geojson(points, properties=props)

    assert feature["properties"] == props
