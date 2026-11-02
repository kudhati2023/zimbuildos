"""
Zimbuild ERP - Site Operations, Field Work Orders & Procurement Engine
Work order automation, 3-way invoice matching with photo-hash verification, and Heavy Plant & Machinery telematics.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
import hashlib
from datetime import datetime


@dataclass
class FieldWorkOrder:
    wo_id: str
    property_or_site_id: str
    unit_or_stand_no: str
    trade_category: str  # Carpentry, Bricklaying, Welding, Glazing, Electrical
    assigned_vendor: str
    scope_of_work: str
    priority: str  # Routine, Urgent, Emergency
    status: str = "Dispatched"  # Dispatched, On-Site, Completed, Inspected
    labor_hours_spent: float = 0.0
    material_cost_usd: float = 0.0
    labor_cost_usd: float = 0.0
    completion_signature: Optional[str] = None

    @property
    def total_cost_usd(self) -> float:
        return round(self.material_cost_usd + self.labor_cost_usd, 2)


@dataclass
class ProcurementOrder:
    po_id: str
    requisition_id: str
    supplier_name: str
    item_description: str
    ordered_quantity: float
    unit_price_usd: float
    unit_of_measure: str  # Bags, Tonnes, Meters, Liters
    delivery_status: str = "Pending"  # Pending, Delivered, Discrepancy
    delivered_quantity: float = 0.0
    receiver_name: Optional[str] = None
    delivery_photo_hash: Optional[str] = None
    supplier_invoice_no: Optional[str] = None
    invoiced_amount_usd: float = 0.0
    three_way_match_passed: bool = False

    @property
    def po_total_usd(self) -> float:
        return round(self.ordered_quantity * self.unit_price_usd, 2)

    def verify_delivery(
        self,
        delivered_qty: float,
        receiver: str,
        photo_bytes_mock: str = "delivery_site_jpg",
    ) -> bool:
        """Site delivery confirmation with mobile photo hash and named receiver log."""
        self.delivered_quantity = delivered_qty
        self.receiver_name = receiver
        self.delivery_photo_hash = hashlib.sha256(
            f"{self.po_id}:{receiver}:{photo_bytes_mock}".encode()
        ).hexdigest()[:16]

        if delivered_qty >= self.ordered_quantity:
            self.delivery_status = "Delivered"
        else:
            self.delivery_status = "Partial Delivery Discrepancy"
        return self.delivery_status == "Delivered"

    def execute_three_way_match(self, invoice_no: str, invoiced_amt: float) -> Dict:
        """3-Way Invoice Matching: Checks Requisition/PO vs Delivery Note vs Supplier Invoice."""
        self.supplier_invoice_no = invoice_no
        self.invoiced_amount_usd = invoiced_amt

        # Condition 1: Delivered qty matches or covers PO qty within 2% tolerance
        qty_match = abs(self.delivered_quantity - self.ordered_quantity) <= (
            self.ordered_quantity * 0.02
        )
        # Condition 2: Invoiced amount matches (delivered_qty * unit_price) within $5 tolerance
        expected_cost = self.delivered_quantity * self.unit_price_usd
        price_match = abs(invoiced_amt - expected_cost) <= 5.0
        # Condition 3: Delivery photo and receiver verified
        photo_verified = bool(self.delivery_photo_hash and self.receiver_name)

        self.three_way_match_passed = qty_match and price_match and photo_verified

        return {
            "po_id": self.po_id,
            "invoice_no": invoice_no,
            "three_way_match_passed": self.three_way_match_passed,
            "ordered_qty": self.ordered_quantity,
            "delivered_qty": self.delivered_quantity,
            "po_amount_usd": self.po_total_usd,
            "invoiced_amount_usd": invoiced_amt,
            "variance_usd": round(invoiced_amt - expected_cost, 2),
            "receiver_audit": self.receiver_name,
            "photo_audit_hash": self.delivery_photo_hash,
        }


@dataclass
class PlantMachineryEquipment:
    asset_id: str
    equipment_name: (
        str  # CAT 320 Hydraulic Excavator, Dynapac Compactor, 15m3 Tipper Truck
    )
    ownership_type: str  # Owned, Hired
    hourly_rate_usd: float  # Internal charge-out or hire rate
    operating_hours: float = 0.0
    idle_downtime_hours: float = 0.0
    fuel_consumed_liters: float = 0.0
    last_service_date: str = "2026-09-15"

    @property
    def total_machine_cost_usd(self) -> float:
        return round(self.operating_hours * self.hourly_rate_usd, 2)

    @property
    def average_fuel_burn_liters_per_hour(self) -> float:
        if self.operating_hours <= 0:
            return 0.0
        return round(self.fuel_consumed_liters / self.operating_hours, 2)

    @property
    def utilization_rate_pct(self) -> float:
        total_time = self.operating_hours + self.idle_downtime_hours
        if total_time <= 0:
            return 0.0
        return round((self.operating_hours / total_time) * 100, 1)


class SiteOperationsManager:
    """Field operations, work orders, procurement, and heavy machinery utilization."""

    def __init__(self):
        self.work_orders: List[FieldWorkOrder] = []
        self.procurement_orders: Dict[str, ProcurementOrder] = {}
        self.equipment_fleet: Dict[str, PlantMachineryEquipment] = {}
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Field Work Orders
        self.work_orders.append(
            FieldWorkOrder(
                wo_id="WO-8801",
                property_or_site_id="SITE-KADOMA-01",
                unit_or_stand_no="Stand #412",
                trade_category="Carpentry & Formwork",
                assigned_vendor="Kwekwe Timber & Formwork Specialists",
                scope_of_work="Erect timber formwork and kickers for foundation ring beam",
                priority="Urgent",
                status="Completed",
                labor_hours_spent=16.0,
                material_cost_usd=320.0,
                labor_cost_usd=240.0,
                completion_signature="Signed: Foreman Ndlovu (2026-10-08)",
            )
        )

        # 2. Procurement Orders (PO)
        po1 = ProcurementOrder(
            po_id="PO-2026-094",
            requisition_id="REQ-441",
            supplier_name="Pretoria Portland Cement (PPC) Bulawayo",
            item_description="Portland Composite Cement 42.5N Structural",
            ordered_quantity=500.0,
            unit_price_usd=10.50,
            unit_of_measure="Bags (50kg)",
        )
        po1.verify_delivery(
            500.0, "Stores Officer J. Mutasa", "photo_ppc_delivery_slip.jpg"
        )
        po1.execute_three_way_match("INV-PPC-88192", 5250.0)

        po2 = ProcurementOrder(
            po_id="PO-2026-095",
            requisition_id="REQ-442",
            supplier_name="Turnall Holdings Ltd Harare",
            item_description="Chromadek Corrugated Roof Sheets (0.5mm)",
            ordered_quantity=120.0,
            unit_price_usd=18.00,
            unit_of_measure="Sheets",
        )
        self.procurement_orders[po1.po_id] = po1
        self.procurement_orders[po2.po_id] = po2

        # 3. Heavy Plant & Machinery Fleet
        self.equipment_fleet["PLANT-01"] = PlantMachineryEquipment(
            asset_id="PLANT-01",
            equipment_name="Caterpillar 320D Tracked Excavator",
            ownership_type="Owned",
            hourly_rate_usd=85.0,
            operating_hours=142.5,
            idle_downtime_hours=18.0,
            fuel_consumed_liters=2450.0,
        )
        self.equipment_fleet["PLANT-02"] = PlantMachineryEquipment(
            asset_id="PLANT-02",
            equipment_name="Dynapac CA250 Vibratory Smooth Roller",
            ownership_type="Hired",
            hourly_rate_usd=65.0,
            operating_hours=88.0,
            idle_downtime_hours=12.0,
            fuel_consumed_liters=1120.0,
        )
        self.equipment_fleet["PLANT-03"] = PlantMachineryEquipment(
            asset_id="PLANT-03",
            equipment_name="Mercedes 2628 Actros 15m³ Tipper Truck",
            ownership_type="Owned",
            hourly_rate_usd=55.0,
            operating_hours=195.0,
            idle_downtime_hours=22.0,
            fuel_consumed_liters=3120.0,
        )

    def log_equipment_shift(
        self, asset_id: str, op_hours: float, idle_hours: float, fuel_liters: float
    ):
        """Logs equipment shifts and telematics fuel burns."""
        if asset_id in self.equipment_fleet:
            eq = self.equipment_fleet[asset_id]
            eq.operating_hours += op_hours
            eq.idle_downtime_hours += idle_hours
            eq.fuel_consumed_liters += fuel_liters

    def get_operations_kpi(self) -> Dict:
        """Fleet utilization and procurement metrics."""
        total_fleet_hours = sum(
            e.operating_hours for e in self.equipment_fleet.values()
        )
        total_fuel = sum(e.fuel_consumed_liters for e in self.equipment_fleet.values())
        total_plant_cost = sum(
            e.total_machine_cost_usd for e in self.equipment_fleet.values()
        )

        verified_pos = sum(
            1 for p in self.procurement_orders.values() if p.three_way_match_passed
        )
        total_pos = len(self.procurement_orders)

        return {
            "total_fleet_operating_hours": total_fleet_hours,
            "total_fleet_fuel_liters": total_fuel,
            "total_fleet_cost_usd": total_plant_cost,
            "three_way_match_compliance_rate_pct": (
                round((verified_pos / total_pos * 100), 1) if total_pos else 0.0
            ),
            "fleet": [
                {
                    "asset_id": e.asset_id,
                    "name": e.equipment_name,
                    "ownership": e.ownership_type,
                    "rate_usd_hr": e.hourly_rate_usd,
                    "hours": e.operating_hours,
                    "utilization_pct": e.utilization_rate_pct,
                    "fuel_liters_hr": e.average_fuel_burn_liters_per_hour,
                    "total_cost_usd": e.total_machine_cost_usd,
                }
                for e in self.equipment_fleet.values()
            ],
        }
