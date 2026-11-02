"""
Zimbuild ERP - Property & Portfolio Management Engine
Central Asset Hub and Real-Time Portfolio Analytics
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime


@dataclass
class UnitConfig:
    unit_id: str
    unit_number: str
    unit_type: str  # e.g., "1-Bed", "2-Bed", "Retail Shop", "Office Suite"
    floor_area_sqft: float
    monthly_rent_usd: float
    is_occupied: bool = False
    tenant_id: Optional[str] = None
    lease_id: Optional[str] = None


@dataclass
class PropertyAsset:
    property_id: str
    name: str
    asset_class: str  # "Residential", "Commercial", "Mixed-Use", "Industrial"
    location: str
    purchase_price_usd: float
    current_valuation_usd: float
    acquisition_year: int
    useful_life_years: int = 40
    annual_operating_expenses_usd: float = 0.0
    units: List[UnitConfig] = field(default_factory=list)

    @property
    def total_sqft(self) -> float:
        return sum(u.floor_area_sqft for u in self.units)

    @property
    def occupied_units(self) -> int:
        return sum(1 for u in self.units if u.is_occupied)

    @property
    def total_units(self) -> int:
        return len(self.units)

    @property
    def occupancy_rate(self) -> float:
        if not self.units:
            return 0.0
        return round((self.occupied_units / self.total_units) * 100, 2)

    @property
    def gross_monthly_potential_rent(self) -> float:
        return sum(u.monthly_rent_usd for u in self.units)

    @property
    def gross_monthly_collected_rent(self) -> float:
        return sum(u.monthly_rent_usd for u in self.units if u.is_occupied)

    @property
    def gross_annual_income(self) -> float:
        return self.gross_monthly_collected_rent * 12

    @property
    def average_rent_per_sqft(self) -> float:
        total_occ_sqft = sum(u.floor_area_sqft for u in self.units if u.is_occupied)
        if total_occ_sqft <= 0:
            return 0.0
        return round(self.gross_monthly_collected_rent / total_occ_sqft, 2)

    @property
    def net_operating_income_usd(self) -> float:
        """NOI = Gross Operating Revenue - Operating Expenses (excluding debt service & depreciation)"""
        return round(self.gross_annual_income - self.annual_operating_expenses_usd, 2)

    @property
    def cap_rate_percent(self) -> float:
        if self.current_valuation_usd <= 0:
            return 0.0
        return round(
            (self.net_operating_income_usd / self.current_valuation_usd) * 100, 2
        )

    def calculate_annual_depreciation(self, current_year: int) -> Dict[str, float]:
        """Straight-line depreciation calculation."""
        years_held = max(0, current_year - self.acquisition_year)
        depreciable_base = (
            self.purchase_price_usd * 0.8
        )  # Exclude land value (assumed 20%)
        annual_depreciation = depreciable_base / self.useful_life_years
        accumulated_depreciation = min(
            depreciable_base, annual_depreciation * years_held
        )
        book_value = (self.purchase_price_usd * 0.2) + (
            depreciable_base - accumulated_depreciation
        )
        return {
            "annual_depreciation": round(annual_depreciation, 2),
            "accumulated_depreciation": round(accumulated_depreciation, 2),
            "net_book_value": round(book_value, 2),
        }


class PortfolioManager:
    """Enterprise Real Estate Portfolio Engine managing multiple asset classes."""

    def __init__(self):
        self.properties: Dict[str, PropertyAsset] = {}
        self._seed_default_portfolio()

    def _seed_default_portfolio(self):
        # 1. Zimbuild Parkview Heights (Mixed-Use in Harare CBD)
        p1 = PropertyAsset(
            property_id="PROP-HRE-001",
            name="Zimbuild Parkview Heights",
            asset_class="Mixed-Use",
            location="Samora Machel Ave, Harare",
            purchase_price_usd=2800000.0,
            current_valuation_usd=3450000.0,
            acquisition_year=2021,
            annual_operating_expenses_usd=42000.0,
            units=[
                UnitConfig(
                    "U-PV-01",
                    "G01-Retail",
                    "Retail Banking Hall",
                    2200,
                    2800.0,
                    True,
                    "TEN-001",
                    "LSE-001",
                ),
                UnitConfig(
                    "U-PV-02",
                    "G02-Retail",
                    "Coffee Shop & Bistro",
                    850,
                    1100.0,
                    True,
                    "TEN-002",
                    "LSE-002",
                ),
                UnitConfig(
                    "U-PV-03",
                    "101-Office",
                    "Corporate Suite A",
                    1600,
                    1900.0,
                    True,
                    "TEN-003",
                    "LSE-003",
                ),
                UnitConfig(
                    "U-PV-04", "102-Office", "Consultancy Suite B", 1200, 1450.0, False
                ),
                UnitConfig(
                    "U-PV-05",
                    "201-Resi",
                    "Penthouse Apartment",
                    1800,
                    2200.0,
                    True,
                    "TEN-004",
                    "LSE-004",
                ),
                UnitConfig(
                    "U-PV-06",
                    "202-Resi",
                    "2-Bed Luxury Suite",
                    1100,
                    1300.0,
                    True,
                    "TEN-005",
                    "LSE-005",
                ),
            ],
        )
        # 2. Hwange HESCO Executive Estate (Residential)
        p2 = PropertyAsset(
            property_id="PROP-HWG-002",
            name="Hwange HESCO Executive Estate",
            asset_class="Residential",
            location="Empumalanga, Hwange",
            purchase_price_usd=1650000.0,
            current_valuation_usd=1950000.0,
            acquisition_year=2022,
            annual_operating_expenses_usd=21000.0,
            units=[
                UnitConfig(
                    "U-HW-01",
                    "V01-Villa",
                    "3-Bed Executive House",
                    1450,
                    850.0,
                    True,
                    "TEN-006",
                    "LSE-006",
                ),
                UnitConfig(
                    "U-HW-02",
                    "V02-Villa",
                    "3-Bed Executive House",
                    1450,
                    850.0,
                    True,
                    "TEN-007",
                    "LSE-007",
                ),
                UnitConfig(
                    "U-HW-03",
                    "V03-Villa",
                    "3-Bed Executive House",
                    1450,
                    850.0,
                    True,
                    "TEN-008",
                    "LSE-008",
                ),
                UnitConfig(
                    "U-HW-04", "V04-Villa", "3-Bed Executive House", 1450, 850.0, False
                ),
                UnitConfig(
                    "U-HW-05",
                    "V05-Villa",
                    "4-Bed Deluxe House",
                    1900,
                    1100.0,
                    True,
                    "TEN-009",
                    "LSE-009",
                ),
            ],
        )
        # 3. Kadoma West Logistics & Industrial Hub (Industrial)
        p3 = PropertyAsset(
            property_id="PROP-KAD-003",
            name="Kadoma West Logistics Hub",
            asset_class="Industrial",
            location="Industrial Sites, Kadoma",
            purchase_price_usd=1200000.0,
            current_valuation_usd=1400000.0,
            acquisition_year=2023,
            annual_operating_expenses_usd=15000.0,
            units=[
                UnitConfig(
                    "U-KD-01",
                    "WH-01",
                    "Heavy Warehouse Bay A",
                    5000,
                    3200.0,
                    True,
                    "TEN-010",
                    "LSE-010",
                ),
                UnitConfig(
                    "U-KD-02",
                    "WH-02",
                    "Heavy Warehouse Bay B",
                    5000,
                    3200.0,
                    True,
                    "TEN-011",
                    "LSE-011",
                ),
                UnitConfig(
                    "U-KD-03",
                    "WH-03",
                    "Light Assembly Bay C",
                    3000,
                    2000.0,
                    True,
                    "TEN-012",
                    "LSE-012",
                ),
            ],
        )
        self.properties[p1.property_id] = p1
        self.properties[p2.property_id] = p2
        self.properties[p3.property_id] = p3

    def get_portfolio_summary(self) -> Dict:
        """Aggregates portfolio-wide real estate metrics."""
        total_assets = len(self.properties)
        total_valuation = sum(p.current_valuation_usd for p in self.properties.values())
        total_units = sum(p.total_units for p in self.properties.values())
        occupied_units = sum(p.occupied_units for p in self.properties.values())
        occupancy_rate = (
            round((occupied_units / total_units * 100), 2) if total_units else 0.0
        )

        annual_gross_income = sum(
            p.gross_annual_income for p in self.properties.values()
        )
        annual_opex = sum(
            p.annual_operating_expenses_usd for p in self.properties.values()
        )
        total_noi = sum(p.net_operating_income_usd for p in self.properties.values())
        avg_cap_rate = (
            round((total_noi / total_valuation * 100), 2) if total_valuation else 0.0
        )

        return {
            "total_assets": total_assets,
            "total_valuation_usd": total_valuation,
            "total_units": total_units,
            "occupied_units": occupied_units,
            "portfolio_occupancy_rate_pct": occupancy_rate,
            "annual_gross_income_usd": annual_gross_income,
            "annual_operating_expenses_usd": annual_opex,
            "portfolio_net_operating_income_usd": total_noi,
            "portfolio_cap_rate_pct": avg_cap_rate,
            "properties": [
                {
                    "property_id": p.property_id,
                    "name": p.name,
                    "asset_class": p.asset_class,
                    "location": p.location,
                    "valuation_usd": p.current_valuation_usd,
                    "occupancy_rate_pct": p.occupancy_rate,
                    "avg_rent_per_sqft": p.average_rent_per_sqft,
                    "noi_usd": p.net_operating_income_usd,
                    "cap_rate_pct": p.cap_rate_percent,
                    "total_units": p.total_units,
                    "occupied_units": p.occupied_units,
                }
                for p in self.properties.values()
            ],
        }
