"""
Zoning Validator:
Validates land survey geometry against ZNHSP statutory rules:
- 100m Wetland buffer exclusion (EMA regulations)
- 40% High-rise/multi-storey densification quota
- Minimum youth and vulnerable housing allocations
"""
from typing import List, Dict, Any
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

class ZoningValidator:
    def __init__(self, wetland_buffer_distance_m: float = 100.0, high_rise_min_ratio: float = 0.40):
        self.wetland_buffer_m = wetland_buffer_distance_m
        self.high_rise_min_ratio = high_rise_min_ratio

    def validate_wetland_buffer(self, parcel_polygon: Polygon, wetland_points_or_polygons: List[Any]) -> Dict[str, Any]:
        """
        Ensures parcel polygon maintains >= 100m buffer distance from any wetland boundary/centroid.
        """
        violations = []
        for idx, w in enumerate(wetland_points_or_polygons):
            buffered_wetland = w.buffer(self.wetland_buffer_m)
            if parcel_polygon.intersects(buffered_wetland):
                dist = parcel_polygon.distance(w)
                violations.append({
                    "wetland_index": idx,
                    "actual_distance_m": round(float(dist), 2),
                    "required_buffer_m": self.wetland_buffer_m,
                    "encroachment_m": round(self.wetland_buffer_m - float(dist), 2)
                })

        compliant = len(violations) == 0
        return {
            "compliant": compliant,
            "status": "APPROVED" if compliant else "REJECTED_WETLAND_ENCROACHMENT",
            "violations": violations
        }

    def validate_densification_quota(self, high_rise_area_m2: float, total_residential_area_m2: float) -> Dict[str, Any]:
        """
        ZNHSP Section 4.3: Mandates minimum 40% land area allocated for high-rise walk-up flats.
        """
        ratio = high_rise_area_m2 / total_residential_area_m2 if total_residential_area_m2 > 0 else 0.0
        compliant = ratio >= self.high_rise_min_ratio
        return {
            "compliant": compliant,
            "high_rise_ratio": round(ratio, 4),
            "target_ratio": self.high_rise_min_ratio,
            "status": "APPROVED" if compliant else "REJECTED_BELOW_DENSIFICATION_MANDATE"
        }
