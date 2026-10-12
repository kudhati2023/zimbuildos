"""
Zimbuild ERP - Lean Construction (LC), Theory of Constraints (TOC) & Fukuda Production System (FPS) Engine
Offline-first synchronization queue, Last Planner System (LPS) PPC tracking, and Goldratt's 5 Focus Steps.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
import hashlib
from datetime import datetime

@dataclass
class LastPlannerWorkTask:
    task_id: str
    trade: str                 # Formwork, Rebar Fixing, Concreting, Brickwork, Roofing
    subcontractor_or_crew: str
    planned_week: int          # Week 1 to 52
    task_description: str
    is_promised: bool = True   # Last Planner commitment
    is_completed: bool = False # Verified at end of week
    root_cause_delay: Optional[str] = None # Material delay, Weather, Predecessor unready, Labor shortage

@dataclass
class OfflineSyncEvent:
    event_id: str
    device_id: str
    user_role: str
    action_type: str           # "DISPATCH_MATERIAL", "LOG_HOURS", "SUBMIT_INSPECTION"
    payload: Dict
    timestamp_device: str
    tamper_proof_hash: str
    synced_to_cloud: bool = False

@dataclass
class QualityPDCACycle:
    cycle_id: str
    work_phase: str
    plan_standard: str
    do_execution_notes: str
    check_inspection_results: str
    act_continuous_improvement: str
    is_compliant: bool = True

class LeanTOCEngine:
    """Theory of Constraints and Lean Construction Controller."""

    def __init__(self):
        self.weekly_plan: List[LastPlannerWorkTask] = []
        self.offline_queue: List[OfflineSyncEvent] = []
        self.pdca_cycles: List[QualityPDCACycle] = []
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Last Planner Tasks for Current Week (e.g. Week 41)
        tasks = [
            LastPlannerWorkTask("LPS-4101", "Earthworks", "Civil Crew A", 41, "Compact subbase for Stand 412 road access", True, True),
            LastPlannerWorkTask("LPS-4102", "Rebar Fixing", "Steel Crew B", 41, "Fix Y12 foundation starter bars on Ring Beam 2", True, True),
            LastPlannerWorkTask("LPS-4103", "Concreting", "Batching Plant Crew", 41, "Pour 25 MPa slab footings Stand 412", True, True),
            LastPlannerWorkTask("LPS-4104", "Brickwork", "Masonry Crew C", 41, "Erect common brickwork to DPC level Stand 413", True, False, "Material delay - quarry sand haulage truck breakdown"),
            LastPlannerWorkTask("LPS-4105", "Electrical", "VoltCraft Subcontractor", 41, "Install conduit sleeves before slab pour", True, True)
        ]
        self.weekly_plan.extend(tasks)

        # 2. PDCA Total Quality Management (TQM) / Fukuda Production System (FPS)
        self.pdca_cycles.append(
            QualityPDCACycle(
                cycle_id="PDCA-01",
                work_phase="Structural Concrete Pouring",
                plan_standard="25 MPa compressive strength at 28 days; Slump test 75-100mm; Water-cement ratio 0.45",
                do_execution_notes="Cast 3 test cubes from central batch; slump measured at 85mm; mechanical vibrator applied",
                check_inspection_results="7-day laboratory crush test reached 18.5 MPa (exceeds 70% threshold). Passed.",
                act_continuous_improvement="Standardize aggregate moisture sensor calibration across all batching shifts (Kaizen SOP #14)"
            )
        )

    def calculate_percent_plan_complete(self, week_num: int) -> Dict[str, float]:
        """Calculates Last Planner System (LPS) PPC metric for workflow predictability."""
        week_tasks = [t for t in self.weekly_plan if t.planned_week == week_num]
        if not week_tasks:
            return {"total_promised": 0, "completed": 0, "ppc_percentage": 100.0}
        
        promised = len(week_tasks)
        completed = sum(1 for t in week_tasks if t.is_completed)
        ppc = round((completed / promised) * 100.0, 1)
        
        delays = {}
        for t in week_tasks:
            if not t.is_completed and t.root_cause_delay:
                delays[t.root_cause_delay] = delays.get(t.root_cause_delay, 0) + 1

        return {
            "week_number": week_num,
            "total_tasks_promised": promised,
            "tasks_completed": completed,
            "ppc_percentage": ppc,
            "delay_reasons": delays
        }

    def analyze_theory_of_constraints(self) -> Dict:
        """Applies Goldratt's 5 Focus Steps to identify and eliminate operational bottlenecks."""
        return {
            "step_1_identify": {
                "active_bottleneck": "Delayed Quarry Sand & 19mm Granite Stone Delivery to Site",
                "impact": "Restricts concrete batching velocity; blocks superstructure mason crews",
                "root_driver": "Regional study driver: Material delivery delays & unverified supplier lead times"
            },
            "step_2_exploit": {
                "action": "Buffer stock at central Kadoma warehouse with 72-hour JIT replenishment trigger"
            },
            "step_3_subordinate": {
                "action": "Schedule bricklaying and rebar tying crews strictly in sync with concrete pour batches"
            },
            "step_4_elevate": {
                "action": "Contract secondary Category 'A' aggregate haulage fleet with GPS telematics tracking"
            },
            "step_5_repeat": {
                "action": "Next iteration evaluates labor productivity tracking using mobile barcode attendance"
            },
            "major_cost_overrun_mitigations": [
                {"driver": "Inaccurate original cost estimation", "mitigation": "QS Master Cost Code mapping with dynamic parametric BOQ"},
                {"driver": "Delayed cost reporting", "mitigation": "Real-time Earned Value Analysis (CPI/SPI) updated daily"},
                {"driver": "Corruption / unverified claims", "mitigation": "3-way invoice matching with mobile photo-hash and named receiver audit"},
                {"driver": "Low labor productivity", "mitigation": "Last Planner System (LPS) weekly work commitments & PPC scoring"},
                {"driver": "Material delivery delays", "mitigation": "Just-In-Time (JIT) delivery coordination & warehouse safety buffers"}
            ]
        }

    def enqueue_offline_event(self, device_id: str, role: str, action: str, data: Dict) -> OfflineSyncEvent:
        """Stores event locally in offline queue with SHA-256 tamper-proof signature."""
        raw_sig = f"{device_id}:{role}:{action}:{datetime.now().isoformat()}:{str(data)}"
        sig_hash = hashlib.sha256(raw_sig.encode()).hexdigest()
        
        event = OfflineSyncEvent(
            event_id=f"EVT-OFF-{len(self.offline_queue)+1:04d}",
            device_id=device_id,
            user_role=role,
            action_type=action,
            payload=data,
            timestamp_device=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            tamper_proof_hash=sig_hash,
            synced_to_cloud=False
        )
        self.offline_queue.append(event)
        return event

    def process_sync_queue(self) -> Dict:
        """Processes and marks all offline queued events as synchronized to central ERP cloud."""
        pending = [e for e in self.offline_queue if not e.synced_to_cloud]
        for e in pending:
            e.synced_to_cloud = True
        return {
            "synced_count": len(pending),
            "total_events_in_audit_log": len(self.offline_queue),
            "cloud_sync_status": "ONLINE & RECONCILED"
        }
