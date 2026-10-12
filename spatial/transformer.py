"""
Spatial Transformer:
Transforms Arc 1950 Gauss Lo (Clarke 1880 mod) survey coordinates to WGS84 (EPSG:4326) and Web Mercator (EPSG:3857).
"""
from typing import Tuple, List, Dict, Any
from pyproj import Transformer

class SpatialTransformer:
    def __init__(self, central_meridian: int = 31):
        self.central_meridian = central_meridian
        # Arc 1950 Transverse Mercator with Zimbabwean 7-parameter Helmert shift to WGS84
        self.proj_str = (
            f"+proj=tmerc +lat_0=0 +lon_0={central_meridian} +k=1.0 "
            f"+x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-143,-90,-294,0,0,0,0 +units=m +no_defs"
        )
        self.transformer = Transformer.from_crs(self.proj_str, "EPSG:4326", always_xy=True)

    def transform_lo_to_wgs84(self, y: float, x: float, west_positive: bool = True) -> Tuple[float, float]:
        """
        Converts a single (Y, X) Gauss Lo point to (longitude, latitude) WGS84.
        In Zimbabwean survey records:
        - Y is Westings (or Eastings relative to Lo meridian)
        - X is Southings (measured positive south from Equator)
        """
        easting = -y if west_positive else y
        northing = -x
        lon, lat = self.transformer.transform(easting, northing)
        return round(float(lon), 7), round(float(lat), 7)

    def lo_polygon_to_geojson(self, yx_points: List[Tuple[float, float]], properties: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Converts an array of (Y, X) boundary points into an RFC 7946 GeoJSON Feature.
        """
        wgs84_coords = []
        for y, x in yx_points:
            lon, lat = self.transform_lo_to_wgs84(y, x)
            wgs84_coords.append([lon, lat])

        # Auto-close ring if needed
        if wgs84_coords and wgs84_coords[0] != wgs84_coords[-1]:
            wgs84_coords.append(wgs84_coords[0])

        return {
            "type": "Feature",
            "properties": properties or {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [wgs84_coords]
            }
        }
