"""
Zimbuild ERP - Construction Job Costing & Tender Management Engine
Quantity Surveyor (QS) Cost Code tracking, BOQ Earned Value Analysis, and Subcontractor Tender Control.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime

@dataclass
class QSCostCode:
    code: str              # e.g., "01-SUB", "02-FRAME", "03-ROOF", "04-FINISH", "05-EXTERNAL"
    division_name: str     # Substructure, Superstructure Frame, Roof Covering, Internal Finishes, External Civil Works
    boq_budget_usd: float  # Original BOQ Allowance
    actual_material_cost_usd: float = 0.0
    actual_labor_cost_usd: float = 0.0
    actual_plant_cost_usd: float = 0.0
    percent_work_completed: float = 0.0  # Physical progress %

    @property
    def total_actual_cost_usd(self) -> float:
        return round(self.actual_material_cost_usd + self.actual_labor_cost_usd + self.actual_plant_cost_usd, 2)

    @property
    def cost_variance_usd(self) -> float:
        """Favorable if negative (under budget), Unfavorable if positive (over budget)"""
        earned_value = (self.percent_work_completed / 100.0) * self.boq_budget_usd
        return round(self.total_actual_cost_usd - earned_value, 2)

    @property
    def cost_performance_index(self) -> float:
        """CPI = Earned Value (EV) / Actual Cost (AC). >1.0 is under budget."""
        ev = (self.percent_work_completed / 100.0) * self.boq_budget_usd
        if self.total_actual_cost_usd <= 0:
            return 1.0
        return round(ev / self.total_actual_cost_usd, 2)

@dataclass
class SubcontractorBid:
    bid_id: str
    subcontractor_name: str
    trade: str               # Electrical, Plumbing, Structural Steel, Earthworks, Waterproofing
    quoted_amount_usd: float
    duration_weeks: int
    zbca_category: str       # Category A, B, C
    safety_compliance_score: int # 0 - 100
    technical_score: int     # 0 - 100
    is_awarded: bool = False

    @property
    def composite_eval_score(self) -> float:
        """Weighted evaluation: 40% Commercial price, 35% Technical, 25% Safety & ZBCA rating"""
        # Baseline benchmark normalized to $50,000
        price_score = max(0, min(100, 100 - ((self.quoted_amount_usd - 30000) / 500)))
        return round((price_score * 0.4) + (self.technical_score * 0.35) + (self.safety_compliance_score * 0.25), 1)

@dataclass
class PaymentApplication:
    app_id: str
    subcontract_id: str
    subcontractor_name: str
    work_description: str
    claimed_gross_amount_usd: float
    certified_amount_usd: float
    retention_rate_pct: float = 10.0   # Standard 10% retention withheld
    status: str = "Under Review"       # Under Review, Certified, Paid
    variation_claims_usd: float = 0.0  # Approved change order additions

    @property
    def retention_withheld_usd(self) -> float:
        return round((self.retention_rate_pct / 100.0) * self.certified_amount_usd, 2)

    @property
    def net_payable_amount_usd(self) -> float:
        return round(self.certified_amount_usd - self.retention_withheld_usd + self.variation_claims_usd, 2)


class JobCostingTenderManager:
    """Quantity Surveyor & Contract Administration Controller."""

    def __init__(self):
        self.cost_codes: Dict[str, QSCostCode] = {}
        self.tenders: Dict[str, List[SubcontractorBid]] = {}
        self.payment_apps: List[PaymentApplication] = []
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Standard QS Master Cost Codes for Zimbuild Housing Scheme
        codes = [
            QSCostCode("01-SUB", "Substructure Earthworks & Foundations", 45000.0, 24500.0, 9200.0, 8100.0, 95.0),
            QSCostCode("02-FRAME", "Superstructure Brickwork & Concrete Columns", 85000.0, 48200.0, 22100.0, 4500.0, 80.0),
            QSCostCode("03-ROOF", "Treated Timber Trusses & Chromadek Roof", 38000.0, 21000.0, 7500.0, 1200.0, 75.0),
            QSCostCode("04-FINISH", "Plastering, Tiling & Architectural Finishes", 52000.0, 18400.0, 11000.0, 800.0, 50.0),
            QSCostCode("05-SERVICES", "Plumbing, Drainage, Electrical Reticulation", 34000.0, 12500.0, 6800.0, 500.0, 45.0),
            QSCostCode("06-EXTERNAL", "Roads, Stormwater & Boundary Walling", 46000.0, 21000.0, 9500.0, 11200.0, 85.0)
        ]
        for c in codes:
            self.cost_codes[c.code] = c

        # 2. Subcontract Tenders (e.g. Electrical Reticulation Package)
        self.tenders["PKG-ELEC-01"] = [
            SubcontractorBid("BID-01", "VoltCraft Electrical Contractors", "Electrical Reticulation", 28500.0, 4, "Category A", 92, 88, True),
            SubcontractorBid("BID-02", "Harare HighVolt Engineering", "Electrical Reticulation", 32000.0, 5, "Category B", 84, 82, False),
            SubcontractorBid("BID-03", "Apex Power Infrastructure", "Electrical Reticulation", 27000.0, 6, "Category C", 75, 78, False)
        ]

        # 3. Payment Applications
        self.payment_apps.append(
            PaymentApplication(
                app_id="PAY-APP-101",
                subcontract_id="PKG-ELEC-01",
                subcontractor_name="VoltCraft Electrical Contractors",
                work_description="Milestone 1: 11kV step-down transformer pad and ducting first-fix",
                claimed_gross_amount_usd=14000.0,
                certified_amount_usd=13500.0,
                retention_rate_pct=10.0,
                status="Certified",
                variation_claims_usd=750.0
            )
        )

    def log_actual_cost(self, code_str: str, material_cost: float = 0, labor_cost: float = 0, plant_cost: float = 0):
        """Maps incoming field expenses to QS Cost Codes."""
        if code_str in self.cost_codes:
            item = self.cost_codes[code_str]
            item.actual_material_cost_usd += material_cost
            item.actual_labor_cost_usd += labor_cost
            item.actual_plant_cost_usd += plant_cost

    def evaluate_tender_package(self, package_id: str) -> List[Dict]:
        """Ranks subcontractor bids based on composite QS evaluation score."""
        bids = self.tenders.get(package_id, [])
        ranked = sorted(bids, key=lambda b: b.composite_eval_score, reverse=True)
        return [
            {
                "bid_id": b.bid_id,
                "contractor": b.subcontractor_name,
                "quote_usd": b.quoted_amount_usd,
                "duration_weeks": b.duration_weeks,
                "zbca_grade": b.zbca_category,
                "score": b.composite_eval_score,
                "awarded": b.is_awarded
            }
            for b in ranked
        ]

    def certify_payment_application(self, app_id: str, certified_amount: float, variations: float = 0.0) -> PaymentApplication:
        """Quantity Surveyor certification and retention withholding."""
        for app in self.payment_apps:
            if app.app_id == app_id:
                app.certified_amount_usd = certified_amount
                app.variation_claims_usd = variations
                app.status = "Certified"
                return app
        raise ValueError(f"Payment Application {app_id} not found")

    def get_job_costing_summary(self) -> Dict:
        """Produces project-wide Earned Value (EV), Budget at Completion (BAC), and Cost Variance."""
        total_bac = sum(c.boq_budget_usd for c in self.cost_codes.values())
        total_ac = sum(c.total_actual_cost_usd for c in self.cost_codes.values())
        total_ev = sum((c.percent_work_completed / 100.0) * c.boq_budget_usd for c in self.cost_codes.values())
        
        project_cpi = round(total_ev / total_ac, 2) if total_ac > 0 else 1.0
        project_cv = round(total_ev - total_ac, 2)
        total_retention = sum(p.retention_withheld_usd for p in self.payment_apps if p.status == "Certified")

        return {
            "budget_at_completion_usd": total_bac,
            "actual_cost_incurred_usd": total_ac,
            "earned_value_usd": round(total_ev, 2),
            "cost_variance_usd": project_cv,
            "project_cpi": project_cpi,
            "accumulated_retention_held_usd": total_retention,
            "cost_codes": [
                {
                    "code": c.code,
                    "division": c.division_name,
                    "budget_usd": c.boq_budget_usd,
                    "actual_cost_usd": c.total_actual_cost_usd,
                    "progress_pct": c.percent_work_completed,
                    "variance_usd": c.cost_variance_usd,
                    "cpi": c.cost_performance_index
                }
                for c in self.cost_codes.values()
            ]
        }
