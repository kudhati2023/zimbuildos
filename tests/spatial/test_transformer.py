import pytest
from spatial.transformer import SpatialTransformer

def test_lo_polygon_to_geojson():
    transformer = SpatialTransformer(central_meridian=31)

    # Simple triangle ring (not closed explicitly)
    # Changed y to be in the range of millions (Zimbabwe coordinates are typically larger)
    yx_points = [
        (-45000.5, 2300000.1),
        (-45001.0, 2300000.2),
        (-45001.5, 2300000.0)
    ]

    properties = {"id": "TEST-STAND-01", "owner": "John Doe"}

    geojson = transformer.lo_polygon_to_geojson(yx_points, properties)

    # Check GeoJSON structure
    assert geojson["type"] == "Feature"
    assert geojson["properties"] == properties
    assert geojson["geometry"]["type"] == "Polygon"

    # Check coordinates
    coords = geojson["geometry"]["coordinates"][0]
    # Ring should be closed (3 original points + 1 closing point = 4)
    assert len(coords) == 4
    # First and last points must be the same
    assert coords[0] == coords[-1]

    # Check that coordinate transformation ran (should be long, lat)
    # The exact values depend on the pyproj transformation
    for lon, lat in coords:
        assert isinstance(lon, float)
        assert isinstance(lat, float)
        # Verify valid lat/lon ranges roughly for Zimbabwe area
        assert 25.0 <= lon <= 35.0
        assert -25.0 <= lat <= -15.0

def test_lo_polygon_to_geojson_already_closed():
    transformer = SpatialTransformer(central_meridian=31)

    # Simple triangle ring (explicitly closed)
    yx_points = [
        (-45000.5, 2300000.1),
        (-45001.0, 2300000.2),
        (-45001.5, 2300000.0),
        (-45000.5, 2300000.1) # closed
    ]

    geojson = transformer.lo_polygon_to_geojson(yx_points)

    coords = geojson["geometry"]["coordinates"][0]
    # Should still be 4 points, not 5
    assert len(coords) == 4
    assert coords[0] == coords[-1]

def test_lo_polygon_to_geojson_empty():
    transformer = SpatialTransformer(central_meridian=31)

    geojson = transformer.lo_polygon_to_geojson([])

    # Should handle empty lists gracefully
    coords = geojson["geometry"]["coordinates"][0]
    assert len(coords) == 0
