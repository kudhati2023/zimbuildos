"""
Supply Chain & Inventory Management: Inventory & Warehouse Management (WMS)
Centralized tracking of materials, bin locations, lot/batch tracking, transfer dispatches,
and real-time reconciliations between Central Stores and Active Construction Sites.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import datetime


@dataclass
class StockItem:
    item_id: str
    name: str
    category: (
        str  # MASONRY, BINDERS, AGGREGATES, STEEL, TIMBER, ROOFING, FINISHES, PREFAB
    )
    unit: str  # units, bags, m3, kg, linear m, sheets, panels
    unit_cost_usd: float
    reorder_threshold: float
    central_store_qty: float = 0.0
    site_allocations: Dict[str, float] = field(
        default_factory=dict
    )  # site_id -> quantity on site
    lot_numbers: List[str] = field(default_factory=list)
    lead_time_days: int = 5
    primary_supplier: str = "General Supplier"

    @property
    def total_stock_on_hand(self) -> float:
        return self.central_store_qty + sum(self.site_allocations.values())

    @property
    def total_valuation_usd(self) -> float:
        return round(self.total_stock_on_hand * self.unit_cost_usd, 2)

    @property
    def is_low_stock(self) -> bool:
        return self.total_stock_on_hand <= self.reorder_threshold


@dataclass
class WarehouseLocation:
    location_id: str
    name: str
    location_type: str  # CENTRAL_STORE, SITE_STORE, PREFAB_YARD
    address: str
    manager: str
    contact_phone: str
    active: bool = True


@dataclass
class StockTransferNote:
    transfer_id: str
    source_location: str
    dest_location: str
    item_id: str
    item_name: str
    quantity: float
    unit: str
    requested_by: str
    authorized_by: str
    dispatched_by: str
    received_by: Optional[str] = None
    status: str = "PENDING"  # PENDING, IN_TRANSIT, DELIVERED, RECONCILED
    timestamp: str = field(
        default_factory=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    )
    lot_number: Optional[str] = None


class WarehouseManagementSystem:
    """Centralized WMS tracking materials across Central Stores and Active Construction Sites."""

    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.locations: Dict[str, WarehouseLocation] = {}
        self.catalog: Dict[str, StockItem] = {}
        self.transfer_history: List[StockTransferNote] = []
        self._seed_wms_data()

    def _seed_wms_data(self):
        # Default Locations
        self.locations["WH-CENTRAL-HAR"] = WarehouseLocation(
            location_id="WH-CENTRAL-HAR",
            name="Harare Central Mega-Store & Depot",
            location_type="CENTRAL_STORE",
            address="Stand 104 Willowvale Industrial Park, Harare",
            manager="Eng. Farai Ndlovu",
            contact_phone="+263 77 210 9940",
        )
        self.locations["SITE-HIGHLANDS-01"] = WarehouseLocation(
            location_id="SITE-HIGHLANDS-01",
            name="Highlands Luxury Estate Site Yard",
            location_type="SITE_STORE",
            address="Stand 45-50 Enterprise Rd, Highlands, Harare",
            manager="Foreman Garikai Sithole",
            contact_phone="+263 77 412 8901",
        )
        self.locations["SITE-KADOMA-02"] = WarehouseLocation(
            location_id="SITE-KADOMA-02",
            name="Kadoma Golden Valley Project Yard",
            location_type="SITE_STORE",
            address="Stand 12 Main St, Kadoma",
            manager="Foreman Tapiwa Zhou",
            contact_phone="+263 71 890 1234",
        )
        self.locations["YARD-PREFAB-01"] = WarehouseLocation(
            location_id="YARD-PREFAB-01",
            name="Mount Hampden Prefabrication & Assembly Yard",
            location_type="PREFAB_YARD",
            address="Plot 4 CyberCity Access Rd, Mount Hampden",
            manager="Eng. Blessing Musona",
            contact_phone="+263 77 554 2210",
        )

        # Catalog Items
        items = [
            StockItem(
                item_id="MAT-BRICK",
                name="Solid Common Clay Bricks",
                category="MASONRY",
                unit="units",
                unit_cost_usd=0.12,
                reorder_threshold=35000,
                central_store_qty=160000,
                site_allocations={"SITE-HIGHLANDS-01": 25000, "SITE-KADOMA-02": 15000},
                lot_numbers=["LOT-BB-2026-09A", "LOT-BB-2026-10B"],
                lead_time_days=3,
                primary_supplier="Beta Bricks / Mount Hampden",
            ),
            StockItem(
                item_id="MAT-CEMENT-32",
                name="Portland Masonry Cement (32.5R 50kg)",
                category="BINDERS",
                unit="bags",
                unit_cost_usd=10.50,
                reorder_threshold=1000,
                central_store_qty=3500,
                site_allocations={"SITE-HIGHLANDS-01": 450, "SITE-KADOMA-02": 250},
                lot_numbers=["LOT-PPC-2610-01"],
                lead_time_days=2,
                primary_supplier="PPC Zimbabwe",
            ),
            StockItem(
                item_id="MAT-CEMENT-42",
                name="High-Strength Structural Cement (42.5N 50kg)",
                category="BINDERS",
                unit="bags",
                unit_cost_usd=12.50,
                reorder_threshold=800,
                central_store_qty=2400,
                site_allocations={"SITE-HIGHLANDS-01": 350, "YARD-PREFAB-01": 500},
                lot_numbers=["LOT-PPC-2610-02"],
                lead_time_days=2,
                primary_supplier="PPC Zimbabwe / Lafarge",
            ),
            StockItem(
                item_id="MAT-RSAND",
                name="Washed River Sand (Plaster & Slab)",
                category="AGGREGATES",
                unit="m³",
                unit_cost_usd=22.00,
                reorder_threshold=150.0,
                central_store_qty=480.0,
                site_allocations={"SITE-HIGHLANDS-01": 120.0, "YARD-PREFAB-01": 80.0},
                lot_numbers=["LOT-SAND-2026-Q4"],
                lead_time_days=1,
                primary_supplier="Zimbuild Quarries & Sand",
            ),
            StockItem(
                item_id="MAT-STONE",
                name="19mm Crushed Granite Aggregate",
                category="AGGREGATES",
                unit="m³",
                unit_cost_usd=28.00,
                reorder_threshold=180.0,
                central_store_qty=540.0,
                site_allocations={"SITE-HIGHLANDS-01": 90.0, "YARD-PREFAB-01": 110.0},
                lot_numbers=["LOT-GRAN-2026-Q4"],
                lead_time_days=2,
                primary_supplier="Davis Granite",
            ),
            StockItem(
                item_id="MAT-REBAR-Y10",
                name="High Tensile Deformed Rebar Y10",
                category="STEEL",
                unit="kg",
                unit_cost_usd=1.45,
                reorder_threshold=4000,
                central_store_qty=13000,
                site_allocations={"SITE-HIGHLANDS-01": 2500, "YARD-PREFAB-01": 3200},
                lot_numbers=["LOT-STL-Y10-88"],
                lead_time_days=5,
                primary_supplier="Lancashire Steel / Trident",
            ),
            StockItem(
                item_id="MAT-REBAR-Y12",
                name="High Tensile Deformed Rebar Y12",
                category="STEEL",
                unit="kg",
                unit_cost_usd=1.50,
                reorder_threshold=4500,
                central_store_qty=16500,
                site_allocations={"SITE-HIGHLANDS-01": 3000, "YARD-PREFAB-01": 4200},
                lot_numbers=["LOT-STL-Y12-91"],
                lead_time_days=5,
                primary_supplier="Lancashire Steel / Trident",
            ),
            StockItem(
                item_id="MAT-ROOF-CHROMA",
                name="Chromadek 0.5mm Roof Sheets (Charcoal)",
                category="ROOFING",
                unit="sheets",
                unit_cost_usd=26.50,
                reorder_threshold=350,
                central_store_qty=1400,
                site_allocations={"SITE-HIGHLANDS-01": 250},
                lot_numbers=["LOT-CHR-2026-CH"],
                lead_time_days=7,
                primary_supplier="Safintra Zimbabwe",
            ),
            StockItem(
                item_id="PREFAB-WALL-STD",
                name="Prefab Lightweight Insulated Wall Panel (2.8m x 1.2m)",
                category="PREFAB",
                unit="panels",
                unit_cost_usd=145.00,
                reorder_threshold=40,
                central_store_qty=12,
                site_allocations={"SITE-HIGHLANDS-01": 48, "YARD-PREFAB-01": 20},
                lot_numbers=["LOT-PANEL-2026-01"],
                lead_time_days=3,
                primary_supplier="Zimbuild Prefabrication Division",
            ),
        ]
        for item in items:
            self.catalog[item.item_id] = item

        # Initial transfer log
        self.transfer_history.append(
            StockTransferNote(
                transfer_id="TRF-2026-001",
                source_location="WH-CENTRAL-HAR",
                dest_location="SITE-HIGHLANDS-01",
                item_id="MAT-BRICK",
                item_name="Solid Common Clay Bricks",
                quantity=25000,
                unit="units",
                requested_by="Foreman Garikai Sithole",
                authorized_by="Eng. Tendai Chiweshe",
                dispatched_by="Clerk Moyo",
                received_by="Garikai Sithole",
                status="DELIVERED",
                lot_number="LOT-BB-2026-09A",
            )
        )

    def get_stock_overview(self) -> List[Dict[str, Any]]:
        """Returns consolidated inventory records across central and site locations."""
        records = []
        for item in self.catalog.values():
            cost_usd = item.total_valuation_usd
            cost_zwg = round(cost_usd * self.fx_rate, 2)
            records.append(
                {
                    "item_id": item.item_id,
                    "name": item.name,
                    "category": item.category,
                    "unit": item.unit,
                    "unit_cost_usd": item.unit_cost_usd,
                    "reorder_threshold": item.reorder_threshold,
                    "central_store_qty": item.central_store_qty,
                    "site_allocations": item.site_allocations,
                    "total_stock_on_hand": item.total_stock_on_hand,
                    "total_valuation_usd": cost_usd,
                    "total_valuation_zwg": cost_zwg,
                    "is_low_stock": item.is_low_stock,
                    "status": (
                        "REORDER_REQUIRED" if item.is_low_stock else "OPTIMAL_STOCK"
                    ),
                    "lead_time_days": item.lead_time_days,
                    "primary_supplier": item.primary_supplier,
                    "lot_numbers": item.lot_numbers,
                }
            )
        return records

    def transfer_material(
        self,
        source_loc: str,
        dest_loc: str,
        item_id: str,
        quantity: float,
        requested_by: str,
        authorized_by: str,
        dispatched_by: str,
    ) -> Dict[str, Any]:
        """
        Dispatches materials from Central Store to Site, or inter-site transfer.
        Ensures strict ledger balancing and prevents negative inventory.
        """
        if item_id not in self.catalog:
            return {
                "success": False,
                "error": f"Item '{item_id}' not found in WMS catalog",
            }

        if source_loc not in self.locations or dest_loc not in self.locations:
            return {
                "success": False,
                "error": "Invalid source or destination location ID",
            }

        item = self.catalog[item_id]

        # Verify source stock availability
        if source_loc == "WH-CENTRAL-HAR":
            available = item.central_store_qty
            if available < quantity:
                return {
                    "success": False,
                    "error": f"Insufficient stock at Central Store. Available: {available}, Requested: {quantity}",
                }
            item.central_store_qty -= quantity
        else:
            available = item.site_allocations.get(source_loc, 0.0)
            if available < quantity:
                return {
                    "success": False,
                    "error": f"Insufficient stock at {source_loc}. Available: {available}, Requested: {quantity}",
                }
            item.site_allocations[source_loc] -= quantity

        # Put into destination
        if dest_loc == "WH-CENTRAL-HAR":
            item.central_store_qty += quantity
        else:
            item.site_allocations[dest_loc] = (
                item.site_allocations.get(dest_loc, 0.0) + quantity
            )

        transfer_ref = f"TRF-2026-{len(self.transfer_history) + 1:03d}"
        active_lot = item.lot_numbers[0] if item.lot_numbers else "LOT-DEFAULT"

        transfer_entry = StockTransferNote(
            transfer_id=transfer_ref,
            source_location=source_loc,
            dest_location=dest_loc,
            item_id=item_id,
            item_name=item.name,
            quantity=quantity,
            unit=item.unit,
            requested_by=requested_by,
            authorized_by=authorized_by,
            dispatched_by=dispatched_by,
            received_by=None,
            status="IN_TRANSIT",
            lot_number=active_lot,
        )
        self.transfer_history.insert(0, transfer_entry)

        return {
            "success": True,
            "transfer_id": transfer_ref,
            "item_id": item_id,
            "quantity": quantity,
            "source_location": source_loc,
            "dest_location": dest_loc,
            "status": "IN_TRANSIT",
            "central_store_balance": item.central_store_qty,
            "site_balance": item.site_allocations.get(dest_loc, 0.0),
        }

    def confirm_transfer_receipt(
        self, transfer_id: str, received_by: str
    ) -> Dict[str, Any]:
        """Site Foreman confirms material arrival and physical condition."""
        transfer = next(
            (t for t in self.transfer_history if t.transfer_id == transfer_id), None
        )
        if not transfer:
            return {"success": False, "error": f"Transfer '{transfer_id}' not found"}

        transfer.received_by = received_by
        transfer.status = "DELIVERED"
        return {
            "success": True,
            "transfer_id": transfer_id,
            "status": "DELIVERED",
            "received_by": received_by,
            "reconciled_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        }

    def record_direct_receipt(
        self,
        item_id: str,
        quantity: float,
        target_location: str,
        lot_number: str,
        supplier: str,
        unit_cost_usd: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Inbounds new material into Central Store or Site with lot tracking."""
        if item_id not in self.catalog:
            return {"success": False, "error": f"Item '{item_id}' not found"}

        item = self.catalog[item_id]
        if target_location == "WH-CENTRAL-HAR":
            item.central_store_qty += quantity
        else:
            item.site_allocations[target_location] = (
                item.site_allocations.get(target_location, 0.0) + quantity
            )

        if lot_number and lot_number not in item.lot_numbers:
            item.lot_numbers.append(lot_number)

        if unit_cost_usd and unit_cost_usd > 0:
            item.unit_cost_usd = unit_cost_usd

        return {
            "success": True,
            "item_id": item_id,
            "added_qty": quantity,
            "target_location": target_location,
            "new_total_stock": item.total_stock_on_hand,
            "lot_number": lot_number,
            "supplier": supplier,
        }
