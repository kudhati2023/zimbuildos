"""
Supply Chain & Inventory Management: Manufacturing (MRP) & Product Lifecycle Management (PLM)
Handles raw material assembly, Bill of Materials (BOM) multi-level explosion,
Engineering Change Orders (ECO), production work orders, and lifecycle stage tracking
for prefabrication components and modular building systems.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import datetime

@dataclass
class BOMComponent:
    raw_material_id: str
    material_name: str
    required_quantity: float
    unit_of_measure: str
    unit_cost_usd: float
    scrap_allowance_pct: float = 3.0 # % buffer for cutting, welding waste

    @property
    def total_component_cost_usd(self) -> float:
        effective_qty = self.required_quantity * (1.0 + (self.scrap_allowance_pct / 100.0))
        return round(effective_qty * self.unit_cost_usd, 2)


@dataclass
class BillOfMaterials:
    bom_id: str
    product_code: str
    product_name: str
    revision: str               # Rev A, Rev B, etc.
    components: List[BOMComponent]
    labor_hours_required: float
    labor_rate_hourly_usd: float
    machine_hours_required: float
    machine_rate_hourly_usd: float
    lifecycle_phase: str = "PRODUCTION_READY" # CONCEPT, PROTOTYPE, PILOT, PRODUCTION_READY, END_OF_LIFE

    @property
    def raw_materials_cost_usd(self) -> float:
        return round(sum(c.total_component_cost_usd for c in self.components), 2)

    @property
    def direct_labor_cost_usd(self) -> float:
        return round(self.labor_hours_required * self.labor_rate_hourly_usd, 2)

    @property
    def machine_overhead_cost_usd(self) -> float:
        return round(self.machine_hours_required * self.machine_rate_hourly_usd, 2)

    @property
    def unit_production_cost_usd(self) -> float:
        return round(self.raw_materials_cost_usd + self.direct_labor_cost_usd + self.machine_overhead_cost_usd, 2)


@dataclass
class EngineeringChangeOrder:
    eco_id: str
    product_code: str
    title: str
    justification: str
    old_revision: str
    new_revision: str
    requested_by: str
    approved_by: Optional[str] = None
    status: str = "PENDING_APPROVAL" # PENDING_APPROVAL, APPROVED, REJECTED, IMPLEMENTED
    created_at: str = field(default_factory=lambda: datetime.datetime.now().strftime("%Y-%m-%d"))


@dataclass
class ProductionWorkOrder:
    work_order_id: str
    product_code: str
    bom_id: str
    target_quantity: int
    completed_quantity: int = 0
    assigned_facility: str = "Mount Hampden Prefab Yard"
    start_date: str = field(default_factory=lambda: datetime.datetime.now().strftime("%Y-%m-%d"))
    completion_date: Optional[str] = None
    status: str = "PLANNED" # PLANNED, IN_ASSEMBLY, QUALITY_INSPECTION, COMPLETED, CANCELLED
    lead_foreman: str = "Eng. Blessing Musona"
    qc_pass_rate_pct: float = 100.0


class ManufacturingPLMManager:
    """Manufacturing Resource Planning (MRP) and Product Lifecycle Management (PLM) Engine."""

    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.bom_registry: Dict[str, BillOfMaterials] = {}
        self.eco_registry: Dict[str, EngineeringChangeOrder] = {}
        self._product_code_idx: Dict[str, BillOfMaterials] = {}
        self.production_orders: Dict[str, ProductionWorkOrder] = {}
        self._seed_mrp_plm_data()

    def get_bom_by_product_code(self, product_code: str) -> Optional[BillOfMaterials]:
        if len(self._product_code_idx) != len(self.bom_registry):
            self._product_code_idx = {b.product_code: b for b in self.bom_registry.values()}
        return self._product_code_idx.get(product_code)

    def _seed_mrp_plm_data(self):
        # 1. Standard Prefab Wall Panel BOM (2.8m x 1.2m)
        bom_wall = BillOfMaterials(
            bom_id="BOM-WALL-2026-A",
            product_code="PREFAB-WALL-STD",
            product_name="Lightweight Insulated Prefab Concrete Wall Panel",
            revision="Rev B",
            components=[
                BOMComponent("MAT-CEMENT-42", "High-Strength Structural Cement", 3.5, "bags", 12.50, scrap_allowance_pct=2.0),
                BOMComponent("MAT-RSAND", "Washed River Sand", 0.45, "m³", 22.00, scrap_allowance_pct=3.0),
                BOMComponent("MAT-STONE", "19mm Granite Aggregate", 0.35, "m³", 28.00, scrap_allowance_pct=2.0),
                BOMComponent("MAT-REBAR-Y10", "High Tensile Deformed Rebar Y10", 22.0, "kg", 1.45, scrap_allowance_pct=4.0),
                BOMComponent("INSUL-EPS-50", "50mm Expanded Polystyrene Core", 3.36, "m²", 6.50, scrap_allowance_pct=1.0)
            ],
            labor_hours_required=4.5,
            labor_rate_hourly_usd=12.00,
            machine_hours_required=1.8,
            machine_rate_hourly_usd=25.00,
            lifecycle_phase="PRODUCTION_READY"
        )

        # 2. Modular Roof Truss Assembly BOM (6m Span)
        bom_truss = BillOfMaterials(
            bom_id="BOM-TRUSS-6M-A",
            product_code="PREFAB-TRUSS-6M",
            product_name="Engineered Lightweight Steel/Timber Composite Truss (6m)",
            revision="Rev A",
            components=[
                BOMComponent("MAT-TIMBER", "Treated SA Pine Timber Trusses (38x114)", 32.0, "linear m", 4.20, scrap_allowance_pct=5.0),
                BOMComponent("MAT-REBAR-Y10", "Tie Rod Steel Connector Y10", 8.5, "kg", 1.45, scrap_allowance_pct=2.0),
                BOMComponent("GANG-NAIL-PLT", "Heavy Duty Galvanized Gang-Nail Connector Plates", 16.0, "units", 1.75, scrap_allowance_pct=0.0)
            ],
            labor_hours_required=3.0,
            labor_rate_hourly_usd=14.00,
            machine_hours_required=1.2,
            machine_rate_hourly_usd=20.00,
            lifecycle_phase="PRODUCTION_READY"
        )

        self.bom_registry[bom_wall.bom_id] = bom_wall
        self.bom_registry[bom_truss.bom_id] = bom_truss

        # 3. Seed Production Work Order
        wo = ProductionWorkOrder(
            work_order_id="PWO-2026-042",
            product_code="PREFAB-WALL-STD",
            bom_id="BOM-WALL-2026-A",
            target_quantity=50,
            completed_quantity=38,
            assigned_facility="Mount Hampden Prefab Yard",
            status="IN_ASSEMBLY",
            lead_foreman="Eng. Blessing Musona",
            qc_pass_rate_pct=98.5
        )
        self.production_orders[wo.work_order_id] = wo

        # 4. Seed ECO
        eco = EngineeringChangeOrder(
            eco_id="ECO-2026-004",
            product_code="PREFAB-WALL-STD",
            title="Upgrade Reinforcement to High-Tensile Y10 Mesh for Seismic Stability",
            justification="Meets Model Building By-laws (SI 76/2025) and ensures enhanced shear resistance for high-rise flats.",
            old_revision="Rev A",
            new_revision="Rev B",
            requested_by="Eng. Blessing Musona",
            approved_by="Dr. Tinashe Manzungu (Group CEO)",
            status="IMPLEMENTED"
        )
        self.eco_registry[eco.eco_id] = eco

    def get_bom_details(self, bom_id: str) -> Optional[Dict[str, Any]]:
        """Returns deep breakdown of a Bill of Materials including component costs and margins."""
        if bom_id not in self.bom_registry:
            return None
        bom = self.bom_registry[bom_id]
        return {
            "bom_id": bom.bom_id,
            "product_code": bom.product_code,
            "product_name": bom.product_name,
            "revision": bom.revision,
            "lifecycle_phase": bom.lifecycle_phase,
            "raw_materials_cost_usd": bom.raw_materials_cost_usd,
            "direct_labor_cost_usd": bom.direct_labor_cost_usd,
            "machine_overhead_usd": bom.machine_overhead_cost_usd,
            "unit_production_cost_usd": bom.unit_production_cost_usd,
            "unit_production_cost_zwg": round(bom.unit_production_cost_usd * self.fx_rate, 2),
            "components": [
                {
                    "raw_material_id": c.raw_material_id,
                    "material_name": c.material_name,
                    "required_quantity": c.required_quantity,
                    "unit": c.unit_of_measure,
                    "unit_cost_usd": c.unit_cost_usd,
                    "scrap_allowance_pct": c.scrap_allowance_pct,
                    "total_cost_usd": c.total_component_cost_usd
                }
                for c in bom.components
            ]
        }

    def explode_mrp_requirements(self, product_code: str, target_quantity: int) -> Dict[str, Any]:
        """
        Calculates total raw materials and production hours required for a production run.
        Enables MRP netting against available stock.
        """
        # Find active BOM
        bom = self.get_bom_by_product_code(product_code)
        if not bom:
            return {"success": False, "error": f"No BOM found for product {product_code}"}

        material_requirements = []
        for c in bom.components:
            gross_qty = round(c.required_quantity * target_quantity * (1.0 + (c.scrap_allowance_pct / 100.0)), 2)
            comp_cost = round(gross_qty * c.unit_cost_usd, 2)
            material_requirements.append({
                "raw_material_id": c.raw_material_id,
                "material_name": c.material_name,
                "gross_quantity_needed": gross_qty,
                "unit": c.unit_of_measure,
                "unit_cost_usd": c.unit_cost_usd,
                "estimated_cost_usd": comp_cost
            })

        total_material_cost = sum(m["estimated_cost_usd"] for m in material_requirements)
        total_labor_hours = round(bom.labor_hours_required * target_quantity, 1)
        total_labor_cost = round(total_labor_hours * bom.labor_rate_hourly_usd, 2)
        total_machine_hours = round(bom.machine_hours_required * target_quantity, 1)
        total_machine_cost = round(total_machine_hours * bom.machine_rate_hourly_usd, 2)

        grand_total_production_usd = round(total_material_cost + total_labor_cost + total_machine_cost, 2)

        return {
            "success": True,
            "product_code": product_code,
            "product_name": bom.product_name,
            "target_quantity": target_quantity,
            "bom_revision": bom.revision,
            "material_requirements": material_requirements,
            "total_material_cost_usd": round(total_material_cost, 2),
            "total_labor_hours": total_labor_hours,
            "total_labor_cost_usd": total_labor_cost,
            "total_machine_hours": total_machine_hours,
            "total_machine_cost_usd": total_machine_cost,
            "grand_total_production_usd": grand_total_production_usd,
            "grand_total_production_zwg": round(grand_total_production_usd * self.fx_rate, 2)
        }

    def launch_production_work_order(
        self,
        product_code: str,
        target_quantity: int,
        lead_foreman: str = "Eng. Blessing Musona",
        facility: str = "Mount Hampden Prefab Yard"
    ) -> Dict[str, Any]:
        """Creates an executable shop-floor manufacturing order."""
        bom = self.get_bom_by_product_code(product_code)
        if not bom:
            return {"success": False, "error": f"No active BOM found for {product_code}"}

        wo_id = f"PWO-2026-{len(self.production_orders) + 43:03d}"
        pwo = ProductionWorkOrder(
            work_order_id=wo_id,
            product_code=product_code,
            bom_id=bom.bom_id,
            target_quantity=target_quantity,
            completed_quantity=0,
            assigned_facility=facility,
            status="IN_ASSEMBLY",
            lead_foreman=lead_foreman
        )
        self.production_orders[wo_id] = pwo
        return {
            "success": True,
            "work_order_id": wo_id,
            "product_name": bom.product_name,
            "target_quantity": target_quantity,
            "facility": facility,
            "status": "IN_ASSEMBLY"
        }

    def complete_production_batch(
        self,
        work_order_id: str,
        produced_qty: int,
        qc_pass_rate_pct: float = 100.0
    ) -> Dict[str, Any]:
        """Logs completion of prefab run and records QC inspection."""
        if work_order_id not in self.production_orders:
            return {"success": False, "error": f"Work Order '{work_order_id}' not found"}

        wo = self.production_orders[work_order_id]
        wo.completed_quantity += produced_qty
        wo.qc_pass_rate_pct = qc_pass_rate_pct
        if wo.completed_quantity >= wo.target_quantity:
            wo.status = "COMPLETED"
            wo.completion_date = datetime.datetime.now().strftime("%Y-%m-%d")

        return {
            "success": True,
            "work_order_id": work_order_id,
            "completed_quantity": wo.completed_quantity,
            "target_quantity": wo.target_quantity,
            "qc_pass_rate_pct": qc_pass_rate_pct,
            "status": wo.status
        }

    def submit_engineering_change_order(
        self,
        product_code: str,
        title: str,
        justification: str,
        old_revision: str,
        new_revision: str,
        requested_by: str
    ) -> Dict[str, Any]:
        """PLM Engineering Change Order (ECO) lifecycle management."""
        eco_id = f"ECO-2026-{len(self.eco_registry) + 5:03d}"
        eco = EngineeringChangeOrder(
            eco_id=eco_id,
            product_code=product_code,
            title=title,
            justification=justification,
            old_revision=old_revision,
            new_revision=new_revision,
            requested_by=requested_by,
            status="PENDING_APPROVAL"
        )
        self.eco_registry[eco_id] = eco
        return {"success": True, "eco_id": eco_id, "status": "PENDING_APPROVAL"}

    def approve_and_implement_eco(
        self,
        eco_id: str,
        approved_by: str
    ) -> Dict[str, Any]:
        """Approves ECO and bumps BOM revision in PLM catalog."""
        if eco_id not in self.eco_registry:
            return {"success": False, "error": f"ECO '{eco_id}' not found"}

        eco = self.eco_registry[eco_id]
        eco.approved_by = approved_by
        eco.status = "IMPLEMENTED"

        # Update relevant BOM revision
        for bom in self.bom_registry.values():
            if bom.product_code == eco.product_code:
                bom.revision = eco.new_revision

        return {
            "success": True,
            "eco_id": eco_id,
            "status": "IMPLEMENTED",
            "new_revision": eco.new_revision,
            "approved_by": approved_by
        }
