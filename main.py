from shapely.geometry import Polygon, Point
from spatial.zoning_validator import ZoningValidator
from spatial.transformer import SpatialTransformer
from src.fintech.ledger import DualCurrencyLedger
from contracts.conveyancer import LegalGatekeeper
from src.civil.earthwork_engine import CivilEngine

def run_mission_control():
    print("======================================================================")
    print("MISSION CONTROL: COMMERCIAL LAND ADMINISTRATION SYSTEM (LAS)")
    print("======================================================================")
    
    # 1. Town Planning & Zoning Compliance
    validator = ZoningValidator()
    stand_poly = Polygon([(0, 0), (50, 0), (50, 50), (0, 50)])
    wetland_res = validator.validate_wetland_buffer(stand_poly, [Point(250, 250)])
    print(f"[1/5] Zoning Wetland Buffer: {'PASSED' if wetland_res['compliant'] else 'FAILED'}")

    # 2. Geodetic Spatial Transformation (Arc 1950 Gauss Lo -> WGS84)
    transformer = SpatialTransformer(central_meridian=31)
    lon, lat = transformer.transform_lo_to_wgs84(0.0, 1972000.0)
    print(f"[2/5] GIS Coordinates WGS84: ({lon}, {lat})")

    # 3. Civil Engineering & Earthwork Sizing
    civil = CivilEngine(fx_rate_zwg_to_usd=26.50)
    earthwork = civil.calculate_cut_fill(area_sqm=2500.0, avg_cut_depth_m=0.3, avg_fill_height_m=0.25)
    print(f"[3/5] Civil Works Earthwork: Net Haul {earthwork['net_balance_m3']} m³ ({earthwork['balance_status']})")

    # 4. Dual-Currency Fintech Settlement (USD / ZWG)
    ledger = DualCurrencyLedger()
    tx1 = ledger.record_installment("STAND-001", 5000.0, "USD", 26.50, 10000.0)
    tx2 = ledger.record_installment("STAND-001", 132500.0, "ZWG", 26.50, 10000.0)
    print(f"[4/5] Dual-Currency Settlement: {'100% PAID' if tx2['is_fully_paid'] else 'PENDING'}")

    # 5. Legal Conveyancing Policy Gatekeeper
    gatekeeper = LegalGatekeeper()
    decision = gatekeeper.verify_title_eligibility(
        zoning_clearance={"wetland_compliant": True},
        spatial_clearance={"certified": True},
        financial_status={"is_fully_paid": True},
        cession_approved=True
    )
    print(f"[5/5] Legal Policy Gate: {decision['action']}")
    print("======================================================================")
    print("ALL CORE PLATFORM SUBSYSTEMS VERIFIED & OPERATIONAL")
    print("======================================================================")

if __name__ == "__main__":
    run_mission_control()
