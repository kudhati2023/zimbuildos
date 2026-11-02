"""
Zimbuild Properties: Building Construction Engine & Material BOQ
Handles residential and commercial building construction operations:
- House model typologies & architectural specifications
- Material quantification (bricks, cement, sand, rebar, timber, roof sheets)
- Construction stage inspection certification & payment drawdowns
- Turnkey Building Contract generation under Zimbabwe Building Contractors Association (ZBCA) standards
"""

from typing import Dict, List, Any
import datetime


class BuildingEngine:
    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.contractor_grade = "Category 'A' Contractor (ZBCA Certified)"
        self.executive_head = "Dr. Tinashe Manzungu (President ZBCA)"

        # Standard Housing Archetypes
        self.house_models = {
            "MODEL_2BED_STARTER": {
                "name": "Highlands Starter 2-Bed",
                "area_sqm": 85.0,
                "bedrooms": 2,
                "bathrooms": 1,
                "stories": 1,
                "description": "Compact modern home with open-plan kitchen, lounge, and solar geyser.",
                "rates": {"GREY": 180.0, "TURNKEY": 350.0, "PREMIUM": 520.0},
            },
            "MODEL_3BED_EXECUTIVE": {
                "name": "Highlands Executive 3-Bed",
                "area_sqm": 165.0,
                "bedrooms": 3,
                "bathrooms": 2,
                "stories": 1,
                "description": "Executive family residence with master ensuite, double garage, and covered patio.",
                "rates": {"GREY": 180.0, "TURNKEY": 350.0, "PREMIUM": 520.0},
            },
            "MODEL_4BED_VILLA": {
                "name": "Highlands Royal Villa 4-Bed",
                "area_sqm": 280.0,
                "bedrooms": 4,
                "bathrooms": 3,
                "stories": 2,
                "description": "Luxury double-storey villa with balconies, scullery, study, and designer finishes.",
                "rates": {"GREY": 180.0, "TURNKEY": 350.0, "PREMIUM": 520.0},
            },
            "MODEL_HIGHRISE_FLAT": {
                "name": "ZNHSP Multi-Storey Apartment (Unit)",
                "area_sqm": 110.0,
                "bedrooms": 3,
                "bathrooms": 2,
                "stories": 4,
                "description": "Vertical densification walk-up apartment meeting ZNHSP 40% statutory mandate.",
                "rates": {"GREY": 195.0, "TURNKEY": 380.0, "PREMIUM": 540.0},
            },
        }

    def calculate_materials_boq(
        self, area_sqm: float, finish_tier: str = "TURNKEY"
    ) -> Dict[str, Any]:
        """
        Quantifies raw building materials required based on floor area.
        Standard empirical construction ratios for Category 'A' builds in Zimbabwe.
        """
        # Material consumption ratios per square meter
        bricks_count = int(area_sqm * 115)  # Standard common bricks
        cement_bags = int(area_sqm * 4.8)  # 50kg bags (PC15 / Supaset 32.5R/42.5N)
        river_sand_m3 = round(area_sqm * 0.28, 1)  # Plaster & mortar sand
        pit_sand_m3 = round(area_sqm * 0.22, 1)  # Bricklaying sand
        crushed_stone_m3 = round(area_sqm * 0.20, 1)  # 19mm concrete stone
        rebar_kg = int(area_sqm * 14.5)  # High tensile deformed bar (Y10/Y12)
        roof_timber_m = int(area_sqm * 7.5)  # Treated SA pine trusses (38x114, 38x76)

        tier_rate = 350.0
        if finish_tier == "GREY":
            tier_rate = 180.0
        elif finish_tier == "PREMIUM":
            tier_rate = 520.0

        total_cost_usd = round(area_sqm * tier_rate, 2)
        total_cost_zwg = round(total_cost_usd * self.fx_rate, 2)

        return {
            "area_sqm": area_sqm,
            "finish_tier": finish_tier,
            "rate_per_sqm_usd": tier_rate,
            "total_cost_usd": total_cost_usd,
            "total_cost_zwg": total_cost_zwg,
            "materials": [
                {
                    "material": "Solid Clay / Concrete Bricks",
                    "quantity": bricks_count,
                    "unit": "units",
                    "approx_cost_usd": round(bricks_count * 0.12, 2),
                },
                {
                    "material": "Portland Cement (50kg bags)",
                    "quantity": cement_bags,
                    "unit": "bags",
                    "approx_cost_usd": round(cement_bags * 11.50, 2),
                },
                {
                    "material": "River Sand (Washed)",
                    "quantity": river_sand_m3,
                    "unit": "m³",
                    "approx_cost_usd": round(river_sand_m3 * 22.0, 2),
                },
                {
                    "material": "Pit Sand (Bricklaying)",
                    "quantity": pit_sand_m3,
                    "unit": "m³",
                    "approx_cost_usd": round(pit_sand_m3 * 18.0, 2),
                },
                {
                    "material": "19mm Crushed Granite Aggregate",
                    "quantity": crushed_stone_m3,
                    "unit": "m³",
                    "approx_cost_usd": round(crushed_stone_m3 * 28.0, 2),
                },
                {
                    "material": "Reinforcement Steel (Y10/Y12)",
                    "quantity": rebar_kg,
                    "unit": "kg",
                    "approx_cost_usd": round(rebar_kg * 1.45, 2),
                },
                {
                    "material": "Treated Structural Timber Trusses",
                    "quantity": roof_timber_m,
                    "unit": "linear metres",
                    "approx_cost_usd": round(roof_timber_m * 4.20, 2),
                },
            ],
        }

    def get_construction_stages(
        self, total_contract_usd: float
    ) -> List[Dict[str, Any]]:
        """
        Returns standardized 7-stage construction progress milestones and valuation schedule.
        """
        stages = [
            {
                "stage_num": 1,
                "name": "Substructure & Foundations",
                "percentage": 15,
                "description": "Trench excavations, strip footings, slab casting, termite poisoning, and DPC.",
            },
            {
                "stage_num": 2,
                "name": "Superstructure Brickwork",
                "percentage": 25,
                "description": "External and internal brick masonry up to wall plate, concrete lintels, gables.",
            },
            {
                "stage_num": 3,
                "name": "Roof Structure & Covering",
                "percentage": 20,
                "description": "Treated timber trusses, fascia boards, Chromadek / concrete tile roofing, underlay.",
            },
            {
                "stage_num": 4,
                "name": "Rough-In Plumbing & Electrical",
                "percentage": 10,
                "description": "Concealed electrical conduit piping, db board, drainage waste pipes, water copper/PEX tubing.",
            },
            {
                "stage_num": 5,
                "name": "Plastering, Ceilings & Screeds",
                "percentage": 10,
                "description": "Internal and external sand-cement plastering, rhinoboard ceilings, smooth floor screeds.",
            },
            {
                "stage_num": 6,
                "name": "Finishes, Glazing & Fixtures",
                "percentage": 15,
                "description": "Floor & wall porcelain tiling, aluminium window glazing, sanitaryware, built-in cupboards, painting.",
            },
            {
                "stage_num": 7,
                "name": "Commissioning & Practical Completion",
                "percentage": 5,
                "description": "Electrical test certification, plumbing pressure testing, snagging, Certificate of Occupancy.",
            },
        ]
        for s in stages:
            stage_usd = round(total_contract_usd * (s["percentage"] / 100.0), 2)
            s["valuation_usd"] = stage_usd
            s["valuation_zwg"] = round(stage_usd * self.fx_rate, 2)
        return stages

    def generate_turnkey_contract(
        self,
        contract_ref: str,
        client_name: str,
        client_id: str,
        client_phone: str,
        stand_id: str,
        model_id: str,
        finish_tier: str,
        custom_area_sqm: float = None,
    ) -> Dict[str, Any]:
        """
        Generates a binding Turnkey House Construction Agreement.
        """
        model = self.house_models.get(
            model_id, self.house_models["MODEL_3BED_EXECUTIVE"]
        )
        area = custom_area_sqm if custom_area_sqm else model["area_sqm"]
        rate = model["rates"].get(finish_tier, 350.0)
        total_contract_usd = round(area * rate, 2)
        total_contract_zwg = round(total_contract_usd * self.fx_rate, 2)
        deposit_usd = round(total_contract_usd * 0.30, 2)
        issue_date = datetime.date.today().strftime("%d %B %Y")

        contract_text = f"""
================================================================================
              TURNKEY RESIDENTIAL BUILDING CONSTRUCTION CONTRACT
                   ZIMBABWE BUILDING CONTRACTORS ASSOCIATION
================================================================================

1. THE CONTRACTOR:
   ZIMBUILD PROPERTIES (PVT) LTD (Category "A" General Building Contractor),
   represented herein by {self.executive_head}.
   Registered Office: Zimbuild House, Enterprise Road, Highlands, Harare.

2. THE EMPLOYER / CLIENT:
   {client_name} (National Identity No: {client_id})
   Contact: {client_phone}

3. THE SITE & WORKS:
   Site Location: {stand_id}, Harare Highlands North Extension.
   Building Archetype: {model['name']} ({area} m² floor area).
   Finish Specification: {finish_tier} FINISHING TIER.
   Zoning: Approved Residential / High-Rise Scheme.

4. CONTRACT SUM & PAYMENT DRAWDOWN:
   4.1 The Total Contract Sum is USD ${total_contract_usd:,.2f}
       (or ZWG {total_contract_zwg:,.2f} at official RBZ rate {self.fx_rate:.2f}).
   4.2 Mobilization Deposit (30%): USD ${deposit_usd:,.2f}.
   4.3 Balance payable in stage drawdowns certified by the Project Engineer:
       - Stage 1: Substructure & Slab (15%)
       - Stage 2: Brickwork to Wall Plate (25%)
       - Stage 3: Roof Structure & Tiles (20%)
       - Stage 4: Services Rough-in (10%)
       - Stage 5: Plaster & Screed (10%)
       - Stage 6: Tiling, Glazing & Paint (15%)
       - Stage 7: Practical Completion & Handover (5%)

5. QUALITY WARRANTIES & STRUCTURAL GUARANTEE:
   The Contractor warrants that all works comply with Model Building By-Laws (Zimbabwe)
   and provides a 10-Year Structural Integrity Warranty on foundations and load-bearing masonry.

SIGNED AT HARARE THIS {issue_date}.

CONTRACTOR: ___________________________    EMPLOYER: ___________________________
Dr. Tinashe Manzungu                       {client_name}
For ZIMBUILD PROPERTIES (Category "A")     Employer / Client
================================================================================
"""
        return {
            "contract_ref": contract_ref,
            "issue_date": issue_date,
            "client_name": client_name,
            "client_id": client_id,
            "stand_id": stand_id,
            "model_name": model["name"],
            "area_sqm": area,
            "finish_tier": finish_tier,
            "total_usd": total_contract_usd,
            "total_zwg": total_contract_zwg,
            "deposit_usd": deposit_usd,
            "contract_markdown": contract_text.strip(),
        }
