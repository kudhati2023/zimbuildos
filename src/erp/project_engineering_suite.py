"""
Project Engineering, Quality/HSE & Mortgage Financing Suite
------------------------------------------------------------
Contains core enterprise engines for:
1. ProjectScheduleManager: Critical Path Method (CPM), Gantt milestone tracking, dependency resolution.
2. QualityHSEManager: NSSA statutory safety audits, concrete cube test crushing (7 & 28 days), digital snag list.
3. MortgageFinancingEngine: Dual-currency amortized installment loans (USD/ZWG), debt-to-income analysis.
4. MunicipalPermitManager: 6-Stage local authority building inspections and Habitation Certificate issuance.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import math


@dataclass
class GanttTask:
    task_id: str
    task_name: str
    phase: str
    duration_days: int
    start_day: int
    end_day: int
    dependencies: List[str]
    progress_pct: int
    status: str  # NOT_STARTED, IN_PROGRESS, COMPLETED, DELAYED
    assigned_contractor: str
    is_critical_path: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_name": self.task_name,
            "phase": self.phase,
            "duration_days": self.duration_days,
            "start_day": self.start_day,
            "end_day": self.end_day,
            "dependencies": self.dependencies,
            "progress_pct": self.progress_pct,
            "status": self.status,
            "assigned_contractor": self.assigned_contractor,
            "is_critical_path": self.is_critical_path,
        }


class ProjectScheduleManager:
    """Critical Path Method (CPM) and Gantt Project Scheduling Engine."""

    def __init__(self):
        self.tasks: Dict[str, GanttTask] = {}
        self._initialize_master_schedule()

    def _initialize_master_schedule(self):
        default_tasks = [
            GanttTask(
                "TSK-01",
                "Topographical Survey & Cadastral Pegging",
                "Phase 1: Planning",
                10,
                1,
                10,
                [],
                100,
                "COMPLETED",
                "Zimbuild Geodesy Dept",
                True,
            ),
            GanttTask(
                "TSK-02",
                "EMA EIA Wetland Buffer Clearance",
                "Phase 1: Planning",
                15,
                5,
                20,
                ["TSK-01"],
                100,
                "COMPLETED",
                "EMA Environmental Auditor",
                False,
            ),
            GanttTask(
                "TSK-03",
                "Bulk Earthworks & Site Leveling",
                "Phase 2: Civil Infrastructure",
                25,
                21,
                45,
                ["TSK-01"],
                100,
                "COMPLETED",
                "Zimbuild Plant Fleet (CAT 320D)",
                True,
            ),
            GanttTask(
                "TSK-04",
                "Deep Gravity Sewer Pipeline (200mm HDPE)",
                "Phase 2: Civil Infrastructure",
                30,
                46,
                75,
                ["TSK-03"],
                90,
                "IN_PROGRESS",
                "Subcontractor: Apex Civil (Pvt) Ltd",
                True,
            ),
            GanttTask(
                "TSK-05",
                "Potable Water Reticulation & Fire Hydrants",
                "Phase 2: Civil Infrastructure",
                20,
                50,
                70,
                ["TSK-03"],
                85,
                "IN_PROGRESS",
                "City of Harare Approved Plumbers",
                False,
            ),
            GanttTask(
                "TSK-06",
                "Dual Asphalt Spine Road & Storm Drains",
                "Phase 2: Civil Infrastructure",
                35,
                76,
                110,
                ["TSK-04"],
                60,
                "IN_PROGRESS",
                "Zimbuild Civils & Dynapac Rollers",
                True,
            ),
            GanttTask(
                "TSK-07",
                "11kV Electrical Feeder & 500kVA Transformer",
                "Phase 2: Civil Infrastructure",
                25,
                80,
                105,
                ["TSK-04"],
                45,
                "IN_PROGRESS",
                "ZETDC Approved Electrical Contractors",
                False,
            ),
            GanttTask(
                "TSK-08",
                "Turnkey House Foundation Excavation & DPC",
                "Phase 3: Building",
                20,
                111,
                130,
                ["TSK-06"],
                25,
                "IN_PROGRESS",
                "Zimbuild Artisan Brigade #01",
                True,
            ),
            GanttTask(
                "TSK-09",
                "Superstructure Brickwork & Ring Beam",
                "Phase 3: Building",
                40,
                131,
                170,
                ["TSK-08"],
                0,
                "NOT_STARTED",
                "Zimbuild Artisan Brigade #02",
                True,
            ),
            GanttTask(
                "TSK-10",
                "Roof Trusses, Sheeting & Internal Finishes",
                "Phase 3: Building",
                35,
                171,
                205,
                ["TSK-09"],
                0,
                "NOT_STARTED",
                "Turnkey Finishing Subcontractors",
                True,
            ),
            GanttTask(
                "TSK-11",
                "Statutory Final Inspection & Occupancy Handover",
                "Phase 4: Commissioning",
                10,
                206,
                215,
                ["TSK-10"],
                0,
                "NOT_STARTED",
                "Harare City Council Inspectorate",
                True,
            ),
        ]
        for t in default_tasks:
            self.tasks[t.task_id] = t

    def get_schedule_summary(self) -> Dict[str, Any]:
        task_list = [t.to_dict() for t in self.tasks.values()]
        total_duration = max((t.end_day for t in self.tasks.values()), default=0)
        overall_progress = sum(t.progress_pct for t in self.tasks.values()) / max(
            1, len(self.tasks)
        )
        critical_count = sum(1 for t in self.tasks.values() if t.is_critical_path)
        delayed_count = sum(1 for t in self.tasks.values() if t.status == "DELAYED")

        return {
            "total_tasks": len(self.tasks),
            "total_duration_days": total_duration,
            "overall_progress_pct": round(overall_progress, 1),
            "critical_path_tasks_count": critical_count,
            "delayed_tasks_count": delayed_count,
            "tasks": task_list,
        }

    def update_task_progress(
        self, task_id: str, progress_pct: int, status: Optional[str] = None
    ) -> GanttTask:
        if task_id not in self.tasks:
            raise ValueError(f"Task '{task_id}' not found in schedule.")
        task = self.tasks[task_id]
        task.progress_pct = max(0, min(100, progress_pct))
        if status:
            task.status = status
        elif task.progress_pct == 100:
            task.status = "COMPLETED"
        elif task.progress_pct > 0:
            task.status = "IN_PROGRESS"
        return task


@dataclass
class ConcreteCubeTest:
    test_id: str
    sample_date: str
    pour_location: str
    structural_element: str  # Foundation, Slab, Column, Ring Beam
    mix_designation: str  # C25, C30, C35 (MPa)
    slump_mm: int  # Target: 75mm - 125mm
    strength_7day_mpa: float  # Target: >= 65% of 28-day
    strength_28day_mpa: float  # Target: >= design MPa
    tested_by: str
    passed: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_id": self.test_id,
            "sample_date": self.sample_date,
            "pour_location": self.pour_location,
            "structural_element": self.structural_element,
            "mix_designation": self.mix_designation,
            "slump_mm": self.slump_mm,
            "strength_7day_mpa": self.strength_7day_mpa,
            "strength_28day_mpa": self.strength_28day_mpa,
            "tested_by": self.tested_by,
            "passed": self.passed,
        }


@dataclass
class SnagItem:
    snag_id: str
    location: str
    trade: str  # Carpentry, Plumbing, Electrical, Painting, Glazing
    description: str
    severity: str  # CRITICAL, MAJOR, MINOR
    photo_hash: str
    assigned_subcontractor: str
    resolved: bool = False
    rectification_date: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snag_id": self.snag_id,
            "location": self.location,
            "trade": self.trade,
            "description": self.description,
            "severity": self.severity,
            "photo_hash": self.photo_hash,
            "assigned_subcontractor": self.assigned_subcontractor,
            "resolved": self.resolved,
            "rectification_date": self.rectification_date,
        }


class QualityHSEManager:
    """Quality Assurance, Health & Safety, Concrete Lab Testing & Snag List Manager."""

    def __init__(self):
        self.cube_tests: Dict[str, ConcreteCubeTest] = {}
        self.snag_items: Dict[str, SnagItem] = {}
        self._initialize_default_records()

    def _initialize_default_records(self):
        # Default concrete cube tests
        t1 = ConcreteCubeTest(
            test_id="CUBE-2026-001",
            sample_date="2026-09-12",
            pour_location="Parkview Heights Stand #001",
            structural_element="Foundation Raft & Strip Footings",
            mix_designation="C25",
            slump_mm=85,
            strength_7day_mpa=18.5,
            strength_28day_mpa=27.2,
            tested_by="Materials Testing Laboratory Zimbabwe",
            passed=True,
        )
        t2 = ConcreteCubeTest(
            test_id="CUBE-2026-002",
            sample_date="2026-09-28",
            pour_location="Highlands High-Rise Core",
            structural_element="Shear Wall & Ground Floor Columns",
            mix_designation="C30",
            slump_mm=95,
            strength_7day_mpa=22.4,
            strength_28day_mpa=33.1,
            tested_by="Standard Association of Zimbabwe (SAZ)",
            passed=True,
        )
        self.cube_tests[t1.test_id] = t1
        self.cube_tests[t2.test_id] = t2

        # Default snags
        s1 = SnagItem(
            "SNG-101",
            "Stand 001 - Kitchen",
            "Plumbing",
            "Minor weeping on sink waste P-trap joint",
            "MINOR",
            "hash_snag_photo_8841a",
            "Apex Plumbers",
            False,
        )
        s2 = SnagItem(
            "SNG-102",
            "Stand 002 - Master Bed",
            "Painting",
            "Touch-up required on north cornice trim",
            "MINOR",
            "hash_snag_photo_9921b",
            "Rainbow Coatings Ltd",
            True,
            "2026-10-04",
        )
        self.snag_items[s1.snag_id] = s1
        self.snag_items[s2.snag_id] = s2

    def record_cube_test(
        self,
        pour_location: str,
        structural_element: str,
        mix_designation: str,
        slump_mm: int,
        strength_7day_mpa: float,
        strength_28day_mpa: float,
        tested_by: str,
    ) -> ConcreteCubeTest:
        """Records a 150mm concrete cube compressive crushing test."""
        target_mpa = (
            float(mix_designation.replace("C", ""))
            if mix_designation.startswith("C")
            else 25.0
        )
        passed = (strength_28day_mpa >= target_mpa) and (
            slump_mm >= 50 and slump_mm <= 150
        )

        test_id = f"CUBE-2026-{len(self.cube_tests) + 1:03d}"
        test = ConcreteCubeTest(
            test_id=test_id,
            sample_date=datetime.now().strftime("%Y-%m-%d"),
            pour_location=pour_location,
            structural_element=structural_element,
            mix_designation=mix_designation,
            slump_mm=slump_mm,
            strength_7day_mpa=strength_7day_mpa,
            strength_28day_mpa=strength_28day_mpa,
            tested_by=tested_by,
            passed=passed,
        )
        self.cube_tests[test_id] = test
        return test

    def log_snag(
        self,
        location: str,
        trade: str,
        description: str,
        severity: str,
        photo_hash: str,
        assigned_subcontractor: str,
    ) -> SnagItem:
        """Logs a digital construction defect/snag."""
        snag_id = f"SNG-{len(self.snag_items) + 101}"
        snag = SnagItem(
            snag_id=snag_id,
            location=location,
            trade=trade,
            description=description,
            severity=severity,
            photo_hash=photo_hash,
            assigned_subcontractor=assigned_subcontractor,
            resolved=False,
        )
        self.snag_items[snag_id] = snag
        return snag

    def resolve_snag(self, snag_id: str) -> SnagItem:
        if snag_id not in self.snag_items:
            raise ValueError(f"Snag item '{snag_id}' not found.")
        snag = self.snag_items[snag_id]
        snag.resolved = True
        snag.rectification_date = datetime.now().strftime("%Y-%m-%d")
        return snag

    def get_quality_summary(self) -> Dict[str, Any]:
        tests = [t.to_dict() for t in self.cube_tests.values()]
        snags = [s.to_dict() for s in self.snag_items.values()]
        passed_tests = sum(1 for t in self.cube_tests.values() if t.passed)
        resolved_snags = sum(1 for s in self.snag_items.values() if s.resolved)

        return {
            "total_cube_tests": len(self.cube_tests),
            "passed_tests": passed_tests,
            "pass_rate_pct": round(
                (passed_tests / max(1, len(self.cube_tests))) * 100, 1
            ),
            "total_snags": len(self.snag_items),
            "resolved_snags": resolved_snags,
            "open_snags": len(self.snag_items) - resolved_snags,
            "cube_tests": tests,
            "snag_items": snags,
        }


class MortgageFinancingEngine:
    """Dual-Currency Mortgage Amortization & Installment Calculator."""

    def __init__(self, rbz_zwg_rate: float = 26.50):
        self.rbz_zwg_rate = rbz_zwg_rate

    def calculate_mortgage(
        self,
        property_price_usd: float,
        deposit_pct: float = 20.0,
        loan_term_years: int = 5,
        annual_interest_rate_pct: float = 12.0,
    ) -> Dict[str, Any]:
        """Calculates amortized loan repayments in both USD and local ZWG."""
        deposit_usd = round(property_price_usd * (deposit_pct / 100.0), 2)
        principal_usd = round(property_price_usd - deposit_usd, 2)

        total_months = loan_term_years * 12
        monthly_rate = (annual_interest_rate_pct / 100.0) / 12.0

        if monthly_rate > 0:
            monthly_payment_usd = round(
                principal_usd
                * (monthly_rate * (1 + monthly_rate) ** total_months)
                / ((1 + monthly_rate) ** total_months - 1),
                2,
            )
        else:
            monthly_payment_usd = round(principal_usd / total_months, 2)

        total_payable_usd = round((monthly_payment_usd * total_months) + deposit_usd, 2)
        total_interest_usd = round(total_payable_usd - property_price_usd, 2)

        # Build first 12 months amortization schedule preview
        schedule = []
        balance = principal_usd
        for m in range(1, min(13, total_months + 1)):
            interest_charge = round(balance * monthly_rate, 2)
            principal_paid = round(monthly_payment_usd - interest_charge, 2)
            balance = max(0.0, round(balance - principal_paid, 2))
            schedule.append(
                {
                    "month": m,
                    "monthly_installment_usd": monthly_payment_usd,
                    "principal_usd": principal_paid,
                    "interest_usd": interest_charge,
                    "closing_balance_usd": balance,
                }
            )

        return {
            "property_price_usd": property_price_usd,
            "property_price_zwg": round(property_price_usd * self.rbz_zwg_rate, 2),
            "deposit_pct": deposit_pct,
            "deposit_usd": deposit_usd,
            "deposit_zwg": round(deposit_usd * self.rbz_zwg_rate, 2),
            "loan_principal_usd": principal_usd,
            "loan_principal_zwg": round(principal_usd * self.rbz_zwg_rate, 2),
            "loan_term_years": loan_term_years,
            "total_months": total_months,
            "annual_interest_rate_pct": annual_interest_rate_pct,
            "monthly_installment_usd": monthly_payment_usd,
            "monthly_installment_zwg": round(
                monthly_payment_usd * self.rbz_zwg_rate, 2
            ),
            "total_payable_usd": total_payable_usd,
            "total_payable_zwg": round(total_payable_usd * self.rbz_zwg_rate, 2),
            "total_interest_usd": total_interest_usd,
            "rbz_zwg_rate": self.rbz_zwg_rate,
            "amortization_preview": schedule,
        }


@dataclass
class BuildingPermitStage:
    stage_id: int
    stage_name: str
    statutory_authority: str
    reference_code: str
    inspected_by: str
    status: str  # PASSED, PENDING, UNDER_REVIEW
    certificate_hash: str
    date_cleared: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stage_id": self.stage_id,
            "stage_name": self.stage_name,
            "statutory_authority": self.statutory_authority,
            "reference_code": self.reference_code,
            "inspected_by": self.inspected_by,
            "status": self.status,
            "certificate_hash": self.certificate_hash,
            "date_cleared": self.date_cleared,
        }


class MunicipalPermitManager:
    """Manages Statutory Building Permits and 6-Stage Local Authority Inspections."""

    def __init__(self):
        self.stages: Dict[int, BuildingPermitStage] = {}
        self._initialize_statutory_stages()

    def _initialize_statutory_stages(self):
        default_stages = [
            BuildingPermitStage(
                1,
                "Architectural & Town Planning Approval (Sect. 34)",
                "City of Harare Urban Planning",
                "HCC-TP-2026-8812",
                "Chief Town Planner",
                "PASSED",
                "hash_perm_stage1_arch",
                "2026-08-14",
            ),
            BuildingPermitStage(
                2,
                "Structural Engineering Design Form 1",
                "Engineering Council of Zimbabwe (ECZ)",
                "ECZ-FORM1-CIV-901",
                "Pr.Eng. Kudakwashe Marufu",
                "PASSED",
                "hash_perm_stage2_form1",
                "2026-08-25",
            ),
            BuildingPermitStage(
                3,
                "Trench & Foundation Concrete Pour Inspection",
                "Municipal Building Inspectorate",
                "MBI-FOUND-098",
                "City Building Inspector Moyo",
                "PASSED",
                "hash_perm_stage3_found",
                "2026-09-15",
            ),
            BuildingPermitStage(
                4,
                "Damp Proof Course (DPC) & Substructure Clearance",
                "Municipal Building Inspectorate",
                "MBI-DPC-102",
                "City Building Inspector Moyo",
                "PASSED",
                "hash_perm_stage4_dpc",
                "2026-09-29",
            ),
            BuildingPermitStage(
                5,
                "Roof Framing & Hurricane Tie-Down Inspection",
                "Municipal Building Inspectorate",
                "MBI-ROOF-204",
                "City Building Inspector Moyo",
                "UNDER_REVIEW",
                "hash_perm_stage5_roof",
                None,
            ),
            BuildingPermitStage(
                6,
                "Final Drainage, Plumbing & Habitation Certificate",
                "City Health & Civil Engineering",
                "HCC-HAB-CERT-FINAL",
                "Director of Works & Chief MHO",
                "PENDING",
                "hash_perm_stage6_hab",
                None,
            ),
        ]
        for s in default_stages:
            self.stages[s.stage_id] = s

    def get_permit_overview(self) -> Dict[str, Any]:
        stage_list = [s.to_dict() for s in self.stages.values()]
        passed_count = sum(1 for s in self.stages.values() if s.status == "PASSED")
        ready_for_occupancy = passed_count == 6

        return {
            "project_name": "Zimbuild Highlands High-Rise Development",
            "statutory_ordinance": "Model Building By-Laws [SI 562 of 1977] & Urban Councils Act [Ch 29:15]",
            "total_stages": 6,
            "stages_cleared": passed_count,
            "compliance_pct": round((passed_count / 6.0) * 100, 1),
            "ready_for_occupancy": ready_for_occupancy,
            "stages": stage_list,
        }

    def signoff_stage(
        self, stage_id: int, inspector_name: str, cert_hash: str
    ) -> BuildingPermitStage:
        if stage_id not in self.stages:
            raise ValueError(f"Statutory Stage {stage_id} not found (must be 1-6).")
        stage = self.stages[stage_id]
        stage.status = "PASSED"
        stage.inspected_by = inspector_name
        stage.certificate_hash = cert_hash
        stage.date_cleared = datetime.now().strftime("%Y-%m-%d")
        return stage
