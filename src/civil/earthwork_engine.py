import math
from typing import Dict, List, Any


class CivilEngine:
    def __init__(self, fx_rate_zwg_to_usd: float = 26.50):
        self.fx_rate = fx_rate_zwg_to_usd
        self.mannings_n = 0.015

    def calculate_cut_fill(
        self, area_sqm: float, avg_cut_depth_m: float, avg_fill_height_m: float
    ) -> Dict[str, Any]:
        cut_vol_m3 = round(area_sqm * avg_cut_depth_m, 2)
        fill_vol_m3 = round(area_sqm * avg_fill_height_m, 2)
        net_haul_m3 = round(cut_vol_m3 - fill_vol_m3, 2)
        return {
            "cut_volume_m3": cut_vol_m3,
            "fill_volume_m3": fill_vol_m3,
            "net_balance_m3": net_haul_m3,
            "balance_status": (
                "EXCESS_CUT (EXPORT)"
                if net_haul_m3 > 0
                else "DEFICIT (BORROW_REQUIRED)"
            ),
        }

    def design_stormwater_drain(
        self,
        bottom_width_m: float,
        water_depth_m: float,
        side_slope: float,
        bed_slope: float,
    ) -> Dict[str, Any]:
        area = (bottom_width_m + (side_slope * water_depth_m)) * water_depth_m
        perimeter = bottom_width_m + (2 * water_depth_m * math.sqrt(1 + side_slope**2))
        hydraulic_radius = area / perimeter if perimeter > 0 else 0
        discharge_q = (
            (1.0 / self.mannings_n)
            * area
            * (hydraulic_radius ** (2.0 / 3.0))
            * math.sqrt(bed_slope)
        )
        velocity_v = discharge_q / area if area > 0 else 0
        return {
            "flow_capacity_m3_s": round(discharge_q, 3),
            "flow_velocity_m_s": round(velocity_v, 2),
            "cross_section_area_m2": round(area, 2),
            "is_non_scouring": velocity_v <= 2.5,
        }

    def generate_infrastructure_boq(
        self, road_length_m: float, sewer_length_m: float, water_length_m: float
    ) -> List[Dict[str, Any]]:
        items = [
            {
                "item": "1.0",
                "description": "Site Clearance & Topsoil Stripping (150mm)",
                "unit": "m²",
                "qty": road_length_m * 12,
                "rate_usd": 3.50,
            },
            {
                "item": "2.0",
                "description": "Bulk Earthworks Road Formation & Compaction",
                "unit": "m³",
                "qty": road_length_m * 12 * 0.4,
                "rate_usd": 12.00,
            },
            {
                "item": "3.0",
                "description": "Hot Asphalt Road Surfacing (40mm wearing course)",
                "unit": "m²",
                "qty": road_length_m * 7,
                "rate_usd": 28.00,
            },
            {
                "item": "4.0",
                "description": "Precast Concrete Stormwater Side Drains (600x600)",
                "unit": "m",
                "qty": road_length_m * 2,
                "rate_usd": 45.00,
            },
            {
                "item": "5.0",
                "description": "uPVC Class 16 Bulk Water Mains (200mm)",
                "unit": "m",
                "qty": water_length_m,
                "rate_usd": 65.00,
            },
            {
                "item": "6.0",
                "description": "Vitrified Clay / Concrete Gravity Sewer (250mm)",
                "unit": "m",
                "qty": sewer_length_m,
                "rate_usd": 85.00,
            },
        ]
        for itm in items:
            total_cost_usd = round(itm["qty"] * itm["rate_usd"], 2)
            itm["total_usd"] = total_cost_usd
            itm["total_zwg"] = round(total_cost_usd * self.fx_rate, 2)
        return items
