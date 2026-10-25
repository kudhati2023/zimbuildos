"""
Zimbuild ERP - Field Service Operations Engine
Manages dispatch, technician work orders, safety JSA protocols, spare parts tracking,
and mobile field logging with GPS check-in and cryptographic photo verification.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Any
from datetime import datetime
import hashlib
import hmac
import os

hmac_env = os.environ.get("ZIMBUILD_HMAC_SECRET")
if not hmac_env:
    raise ValueError("CRITICAL: ZIMBUILD_HMAC_SECRET environment variable is missing.")
HMAC_SECRET = hmac_env.encode()


class ServicePriority(str, Enum):
    P1_EMERGENCY = "P1 Emergency (1-hr SLA)"
    P2_URGENT = "P2 Urgent (4-hr SLA)"
    P3_HIGH = "P3 High (12-hr SLA)"
    P4_ROUTINE = "P4 Routine (48-hr SLA)"


class ServiceCategory(str, Enum):
    PLANT_BREAKDOWN = "Heavy Plant & Equipment Breakdown"
    ELECTRICAL_POWER = "Electrical Reticulation & Distribution"
    PLUMBING_WATER = "Plumbing, Sewer & Bulk Water"
    CIVIL_STRUCTURAL = "Civil Infrastructure & Concrete Maintenance"
    HVAC_VENTILATION = "HVAC & Mechanical Ventilation"
    JOINERY_ROOFING = "Joinery, Glazing & Roof Sealing"


class WorkOrderStatus(str, Enum):
    DRAFT = "Draft"
    DISPATCHED = "Dispatched"
    EN_ROUTE = "En Route"
    IN_PROGRESS = "In Progress"
    PENDING_PARTS = "Pending Parts"
    COMPLETED = "Completed"
    INSPECTED = "Inspected & Certified"


@dataclass
class TechnicianProfile:
    tech_id: str
    full_name: str
    primary_trade: str
    nec_grade: str
    mobile_phone: str
    assigned_service_vehicle: str
    current_status: str = "Available"  # Available, En Route, On Site, Off Duty
    current_gps_coords: str = "-17.8250, 31.0480"
    completed_jobs_count: int = 42
    customer_rating: float = 4.9


@dataclass
class ServiceRequest:
    request_id: str
    category: str
    priority: str
    site_location: str
    unit_or_stand_no: str
    client_or_requester: str
    requester_phone: str
    problem_description: str
    reported_at: str
    target_sla_hours: float
    status: str = "Pending Dispatch"  # Pending Dispatch, Dispatched, Resolved, Closed
    assigned_wo_id: Optional[str] = None


@dataclass
class ServiceWorkOrder:
    wo_id: str
    request_id: str
    assigned_tech_id: str
    site_location: str
    category: str
    priority: str
    scope_of_work: str
    status: str = WorkOrderStatus.DISPATCHED.value
    dispatched_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))
    jsa_safety_checklist_completed: bool = False
    jsa_hazard_controls: List[str] = field(default_factory=list)
    parts_consumed: List[Dict[str, Any]] = field(default_factory=list)
    labor_hours_logged: float = 0.0
    hourly_labor_rate_usd: float = 35.0
    work_notes: str = ""
    client_signoff_name: Optional[str] = None
    completion_timestamp: Optional[str] = None
    digital_signature_hash: Optional[str] = None

    @property
    def total_parts_cost_usd(self) -> float:
        return round(sum(p.get("qty", 0.0) * p.get("unit_price_usd", 0.0) for p in self.parts_consumed), 2)

    @property
    def total_labor_cost_usd(self) -> float:
        return round(self.labor_hours_logged * self.hourly_labor_rate_usd, 2)

    @property
    def total_work_order_cost_usd(self) -> float:
        return round(self.total_parts_cost_usd + self.total_labor_cost_usd, 2)


@dataclass
class MobileFieldLogEntry:
    log_id: str
    wo_id: str
    tech_id: str
    action_type: str  # GPS_CHECKIN, JSA_CONFIRM, LOG_PARTS, PHOTO_PROOF, CLIENT_SIGNOFF, COMPLETE_JOB
    timestamp: str
    gps_lat_lng: str
    photo_hash: Optional[str] = None
    notes: str = ""
    synced_to_server: bool = True


class FieldServiceManager:
    """Enterprise Field Service Dispatch, Mobile Logging & Maintenance Crew System."""

    def __init__(self):
        self.technicians: Dict[str, TechnicianProfile] = {}
        self.service_requests: Dict[str, ServiceRequest] = {}
        self.work_orders: Dict[str, ServiceWorkOrder] = {}
        self.mobile_logs: List[MobileFieldLogEntry] = []
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Field Service Technicians
        t1 = TechnicianProfile(
            tech_id="TECH-001",
            full_name="Enock Chimedza",
            primary_trade="Class 1 Industrial Electrician",
            nec_grade="Grade 7: Class 1 Artisan",
            mobile_phone="+263 773 892 110",
            assigned_service_vehicle="Ford Ranger 4x4 (AEZ-9012)",
            current_status="On Site",
            current_gps_coords="-17.8292, 31.0522",
            completed_jobs_count=58,
            customer_rating=4.9
        )
        t2 = TechnicianProfile(
            tech_id="TECH-002",
            full_name="Godfrey Nyasha",
            primary_trade="Class 1 Diesel Plant Mechanic",
            nec_grade="Grade 7: Class 1 Artisan",
            mobile_phone="+263 772 441 908",
            assigned_service_vehicle="Isuzu D-Max Field Support (AFG-4491)",
            current_status="Available",
            current_gps_coords="-18.3333, 29.9167",
            completed_jobs_count=74,
            customer_rating=4.8
        )
        t3 = TechnicianProfile(
            tech_id="TECH-003",
            full_name="Lovemore Sibanda",
            primary_trade="Class 1 Plumber & Pipefitter",
            nec_grade="Grade 7: Class 1 Artisan",
            mobile_phone="+263 714 559 021",
            assigned_service_vehicle="Toyota Hilux Single Cab (AFK-1102)",
            current_status="Available",
            current_gps_coords="-17.8200, 31.0400",
            completed_jobs_count=49,
            customer_rating=4.7
        )
        self.technicians[t1.tech_id] = t1
        self.technicians[t2.tech_id] = t2
        self.technicians[t3.tech_id] = t3

        # 2. Service Requests
        sr1 = ServiceRequest(
            request_id="SR-2026-001",
            category=ServiceCategory.ELECTRICAL_POWER.value,
            priority=ServicePriority.P1_EMERGENCY.value,
            site_location="Parkview Heights High-Rise",
            unit_or_stand_no="Stand #001 / Unit 402",
            client_or_requester="Stanbic Bank Facilities / Tendai Moyo",
            requester_phone="+263 772 900 110",
            problem_description="Distribution panel power surge trip; main commercial HVAC and server backup circuits offline.",
            reported_at="2026-10-09 08:30",
            target_sla_hours=1.0,
            status="Dispatched",
            assigned_wo_id="FWO-2026-001"
        )
        sr2 = ServiceRequest(
            request_id="SR-2026-002",
            category=ServiceCategory.PLANT_BREAKDOWN.value,
            priority=ServicePriority.P2_URGENT.value,
            site_location="Kadoma Phase 2 Road Servicing",
            unit_or_stand_no="Borrow Pit Station 4",
            client_or_requester="Site Superintendent T. Zhou",
            requester_phone="+263 774 123 456",
            problem_description="CAT 320D main boom hydraulic pressure drop and burst high-pressure hose.",
            reported_at="2026-10-09 09:15",
            target_sla_hours=4.0,
            status="Pending Dispatch"
        )
        self.service_requests[sr1.request_id] = sr1
        self.service_requests[sr2.request_id] = sr2

        # 3. Active Work Order
        wo1 = ServiceWorkOrder(
            wo_id="FWO-2026-001",
            request_id="SR-2026-001",
            assigned_tech_id="TECH-001",
            site_location="Parkview Heights High-Rise Unit 402",
            category=ServiceCategory.ELECTRICAL_POWER.value,
            priority=ServicePriority.P1_EMERGENCY.value,
            scope_of_work="Isolate 3-phase feeder, replace burnt 100A 3P circuit breaker, perform insulation resistance testing and restore supply.",
            status=WorkOrderStatus.IN_PROGRESS.value,
            jsa_safety_checklist_completed=True,
            jsa_hazard_controls=["Lockout/Tagout (LOTO) Verified", "Arc Flash PPE Worn", "Voltage Free Verification Test Passed"],
            parts_consumed=[
                {"part_code": "EL-CB-100A", "description": "Schneider 100A 3-Phase Moulded Case Breaker", "qty": 1.0, "unit_price_usd": 145.0},
                {"part_code": "EL-LUG-35MM", "description": "Copper Heavy Duty Cable Lugs 35mm²", "qty": 6.0, "unit_price_usd": 3.50}
            ],
            labor_hours_logged=2.5,
            hourly_labor_rate_usd=40.0,
            work_notes="Fault isolated to worn copper lug overheating. Breaker replaced, phase balancing checked at 415V."
        )
        self.work_orders[wo1.wo_id] = wo1

        # 4. Mobile Log Entry
        mlog = MobileFieldLogEntry(
            log_id="MLOG-001",
            wo_id="FWO-2026-001",
            tech_id="TECH-001",
            action_type="GPS_CHECKIN",
            timestamp="2026-10-09 08:52",
            gps_lat_lng="-17.8292, 31.0522",
            photo_hash="SHA256:d892ba9f3021ec89",
            notes="Technician arrived on-site within 22 minutes (P1 SLA target met)."
        )
        self.mobile_logs.append(mlog)

    # --- DISPATCH MANAGEMENT ---
    def create_service_request(
        self,
        category: str,
        priority: str,
        site_location: str,
        unit_or_stand_no: str,
        client_name: str,
        phone: str,
        problem_description: str
    ) -> ServiceRequest:
        req_id = f"SR-2026-{len(self.service_requests) + 1:03d}"
        sla = 1.0 if "P1" in priority else (4.0 if "P2" in priority else (12.0 if "P3" in priority else 48.0))
        req = ServiceRequest(
            request_id=req_id,
            category=category,
            priority=priority,
            site_location=site_location,
            unit_or_stand_no=unit_or_stand_no,
            client_or_requester=client_name,
            requester_phone=phone,
            problem_description=problem_description,
            reported_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
            target_sla_hours=sla,
            status="Pending Dispatch"
        )
        self.service_requests[req_id] = req
        return req

    def dispatch_work_order(
        self,
        request_id: str,
        tech_id: str,
        scope_of_work: str,
        hourly_rate_usd: float = 35.0
    ) -> ServiceWorkOrder:
        req = self.service_requests.get(request_id)
        if not req:
            raise ValueError(f"Service Request {request_id} not found")
        tech = self.technicians.get(tech_id)
        if not tech:
            raise ValueError(f"Technician {tech_id} not found")

        wo_id = f"FWO-2026-{len(self.work_orders) + 1:03d}"
        wo = ServiceWorkOrder(
            wo_id=wo_id,
            request_id=request_id,
            assigned_tech_id=tech_id,
            site_location=req.site_location,
            category=req.category,
            priority=req.priority,
            scope_of_work=scope_of_work,
            status=WorkOrderStatus.DISPATCHED.value,
            hourly_labor_rate_usd=hourly_rate_usd
        )
        self.work_orders[wo_id] = wo
        req.status = "Dispatched"
        req.assigned_wo_id = wo_id
        tech.current_status = "En Route"
        return wo

    # --- WORK ORDER EXECUTION & JSA SAFETY PROTOCOL ---
    def record_jsa_safety_checklist(self, wo_id: str, hazard_controls: List[str]) -> bool:
        """Confirms Job Safety Analysis (JSA) / PPE pre-work hazard verification."""
        wo = self.work_orders.get(wo_id)
        if not wo:
            return False
        wo.jsa_safety_checklist_completed = True
        wo.jsa_hazard_controls = hazard_controls
        wo.status = WorkOrderStatus.IN_PROGRESS.value
        return True

    def add_parts_to_work_order(self, wo_id: str, part_code: str, description: str, qty: float, unit_price_usd: float) -> float:
        """Adds consumed parts/materials to field work order."""
        wo = self.work_orders.get(wo_id)
        if not wo:
            raise ValueError(f"Work order {wo_id} not found")
        wo.parts_consumed.append({
            "part_code": part_code,
            "description": description,
            "qty": qty,
            "unit_price_usd": unit_price_usd,
            "line_total_usd": round(qty * unit_price_usd, 2)
        })
        return wo.total_parts_cost_usd

    def complete_work_order(
        self,
        wo_id: str,
        labor_hours: float,
        work_notes: str,
        client_name: str,
        client_signature_text: str = "Client Signed Digital Seal"
    ) -> ServiceWorkOrder:
        """Completes work order, seals with cryptographic HMAC hash and marks tech available."""
        wo = self.work_orders.get(wo_id)
        if not wo:
            raise ValueError(f"Work order {wo_id} not found")

        wo.labor_hours_logged = labor_hours
        wo.work_notes = work_notes
        wo.client_signoff_name = client_name
        wo.status = WorkOrderStatus.COMPLETED.value
        wo.completion_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

        # Cryptographic tamper-evident signature
        seal_payload = f"{wo.wo_id}:{wo.assigned_tech_id}:{wo.total_work_order_cost_usd}:{client_name}:{wo.completion_timestamp}"
        wo.digital_signature_hash = hmac.new(HMAC_SECRET, seal_payload.encode(), hashlib.sha256).hexdigest()

        # Update Request Status
        if wo.request_id in self.service_requests:
            self.service_requests[wo.request_id].status = "Resolved"

        # Update Technician Profile
        tech = self.technicians.get(wo.assigned_tech_id)
        if tech:
            tech.current_status = "Available"
            tech.completed_jobs_count += 1

        return wo

    # --- MOBILE FIELD LOGGING WITH GPS & CRYPTOGRAPHIC PHOTO VERIFICATION ---
    def record_mobile_field_log(
        self,
        wo_id: str,
        tech_id: str,
        action_type: str,
        gps_lat_lng: str,
        photo_bytes_or_string: Optional[str] = None,
        notes: str = ""
    ) -> MobileFieldLogEntry:
        """Records a field mobile log event with GPS coordinates and tamper-proof photo hash."""
        photo_hash = None
        if photo_bytes_or_string:
            raw_hash = hashlib.sha256(photo_bytes_or_string.encode()).hexdigest()[:16]
            photo_hash = f"PHOTO_SHA256_{raw_hash}"

        log_id = f"MLOG-{len(self.mobile_logs) + 1:04d}"
        log = MobileFieldLogEntry(
            log_id=log_id,
            wo_id=wo_id,
            tech_id=tech_id,
            action_type=action_type,
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            gps_lat_lng=gps_lat_lng,
            photo_hash=photo_hash,
            notes=notes,
            synced_to_server=True
        )
        self.mobile_logs.append(log)

        # Update technician GPS coordinate
        tech = self.technicians.get(tech_id)
        if tech:
            tech.current_gps_coords = gps_lat_lng
            if action_type == "GPS_CHECKIN":
                tech.current_status = "On Site"

        return log

    def get_field_service_summary(self) -> Dict[str, Any]:
        """Returns comprehensive field service operations metrics."""
        total_requests = len(self.service_requests)
        pending_dispatch = sum(1 for r in self.service_requests.values() if r.status == "Pending Dispatch")
        active_wos = sum(1 for w in self.work_orders.values() if w.status in [WorkOrderStatus.DISPATCHED.value, WorkOrderStatus.IN_PROGRESS.value])
        completed_wos = sum(1 for w in self.work_orders.values() if w.status == WorkOrderStatus.COMPLETED.value)
        total_costs = sum(w.total_work_order_cost_usd for w in self.work_orders.values())

        return {
            "total_service_requests": total_requests,
            "pending_dispatch_count": pending_dispatch,
            "active_work_orders_count": active_wos,
            "completed_work_orders_count": completed_wos,
            "total_maintenance_expenditure_usd": round(total_costs, 2),
            "available_technicians_count": sum(1 for t in self.technicians.values() if t.current_status == "Available"),
            "technicians": [
                {
                    "tech_id": t.tech_id,
                    "name": t.full_name,
                    "trade": t.primary_trade,
                    "phone": t.mobile_phone,
                    "vehicle": t.assigned_service_vehicle,
                    "status": t.current_status,
                    "gps": t.current_gps_coords,
                    "completed_jobs": t.completed_jobs_count,
                    "rating": t.customer_rating
                }
                for t in self.technicians.values()
            ],
            "active_work_orders": [
                {
                    "wo_id": w.wo_id,
                    "request_id": w.request_id,
                    "tech_id": w.assigned_tech_id,
                    "site": w.site_location,
                    "category": w.category,
                    "priority": w.priority,
                    "status": w.status,
                    "labor_hours": w.labor_hours_logged,
                    "total_cost_usd": w.total_work_order_cost_usd,
                    "jsa_completed": w.jsa_safety_checklist_completed,
                    "signature_hash": w.digital_signature_hash
                }
                for w in self.work_orders.values()
            ],
            "recent_mobile_logs": [
                {
                    "log_id": m.log_id,
                    "wo_id": m.wo_id,
                    "tech": m.tech_id,
                    "action": m.action_type,
                    "time": m.timestamp,
                    "gps": m.gps_lat_lng,
                    "photo_hash": m.photo_hash,
                    "notes": m.notes
                }
                for m in self.mobile_logs[-10:]
            ]
        }
