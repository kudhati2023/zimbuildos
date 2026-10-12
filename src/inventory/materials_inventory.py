"""
Zimbuild Properties: Building Materials Inventory & Usage Tracking Engine
Handles warehouse stock levels, Goods Received Notes (GRN), site material requisitions,
and per-project material consumption audit trails.
"""
from typing import Dict, List, Any
import datetime

class MaterialsInventoryManager:
    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        
        # Central Warehouse Stock Catalog
        self.inventory = {
            "MAT-BRICK": {
                "name": "Solid Common Clay Bricks",
                "category": "MASONRY",
                "unit": "units",
                "stock_on_hand": 185000,
                "reorder_level": 30000,
                "unit_cost_usd": 0.12,
                "supplier": "Beta Bricks / Mount Hampden"
            },
            "MAT-CEMENT-32": {
                "name": "Portland Cement (PC15 / 32.5R 50kg)",
                "category": "BINDERS",
                "unit": "bags",
                "stock_on_hand": 4200,
                "reorder_level": 800,
                "unit_cost_usd": 11.50,
                "supplier": "PPC Zimbabwe / Sino-Zimbabwe"
            },
            "MAT-CEMENT-42": {
                "name": "High-Strength Cement (Supaset 42.5N 50kg)",
                "category": "BINDERS",
                "unit": "bags",
                "stock_on_hand": 2100,
                "reorder_level": 500,
                "unit_cost_usd": 13.00,
                "supplier": "PPC Zimbabwe"
            },
            "MAT-RSAND": {
                "name": "Washed River Sand (Plaster & Slab)",
                "category": "AGGREGATES",
                "unit": "m³",
                "stock_on_hand": 580.0,
                "reorder_level": 120.0,
                "unit_cost_usd": 22.00,
                "supplier": "Zimbuild Quarries & Sand"
            },
            "MAT-PSAND": {
                "name": "Pit Sand (Bricklaying Mortar)",
                "category": "AGGREGATES",
                "unit": "m³",
                "stock_on_hand": 460.0,
                "reorder_level": 100.0,
                "unit_cost_usd": 18.00,
                "supplier": "Zimbuild Quarries & Sand"
            },
            "MAT-STONE": {
                "name": "19mm Crushed Granite Aggregate",
                "category": "AGGREGATES",
                "unit": "m³",
                "stock_on_hand": 620.0,
                "reorder_level": 150.0,
                "unit_cost_usd": 28.00,
                "supplier": "Davis Granite / Zimbuild"
            },
            "MAT-REBAR-Y10": {
                "name": "High Tensile Deformed Rebar Y10",
                "category": "STEEL",
                "unit": "kg",
                "stock_on_hand": 14500,
                "reorder_level": 3000,
                "unit_cost_usd": 1.45,
                "supplier": "Lancashire Steel / Trident"
            },
            "MAT-REBAR-Y12": {
                "name": "High Tensile Deformed Rebar Y12",
                "category": "STEEL",
                "unit": "kg",
                "stock_on_hand": 18200,
                "reorder_level": 3500,
                "unit_cost_usd": 1.50,
                "supplier": "Lancashire Steel / Trident"
            },
            "MAT-TIMBER": {
                "name": "Treated Structural Timber (SA Pine 38x114)",
                "category": "TIMBER",
                "unit": "linear metres",
                "stock_on_hand": 8400,
                "reorder_level": 1500,
                "unit_cost_usd": 4.20,
                "supplier": "Border Timbers / Allied"
            },
            "MAT-ROOF-CHROMA": {
                "name": "Chromadek 0.5mm Roof Sheets (Charcoal)",
                "category": "ROOFING",
                "unit": "sheets",
                "stock_on_hand": 1650,
                "reorder_level": 300,
                "unit_cost_usd": 26.50,
                "supplier": "Safintra Zimbabwe"
            },
            "MAT-TILES": {
                "name": "600x600 Glazed Porcelain Floor Tiles",
                "category": "FINISHES",
                "unit": "m²",
                "stock_on_hand": 3800,
                "reorder_level": 600,
                "unit_cost_usd": 16.00,
                "supplier": "Sunny Yi Feng / Tile & Carpet"
            },
            "MAT-PAINT": {
                "name": "Super Acrylic PVA Paint (White 20L)",
                "category": "FINISHES",
                "unit": "drums",
                "stock_on_hand": 450,
                "reorder_level": 80,
                "unit_cost_usd": 68.00,
                "supplier": "Astra Paints / Dulux"
            }
        }

        # Immutable Usage & Dispatch History
        self.usage_log = [
            {
                "dispatch_id": "DSP-2026-101",
                "date": "2026-10-06 08:30",
                "site_id": "SITE-101",
                "stand_id": "STAND-001",
                "project_name": "Highlands Royal Villa (Takudzwa Kunaka)",
                "material_id": "MAT-BRICK",
                "material_name": "Solid Common Clay Bricks",
                "quantity": 25000,
                "unit": "units",
                "stage": "Stage 2: Superstructure",
                "authorized_by": "Eng. Tendai Chiweshe",
                "foreman": "Foreman Garikai Sithole",
                "status": "DELIVERED_ON_SITE"
            },
            {
                "dispatch_id": "DSP-2026-102",
                "date": "2026-10-07 10:15",
                "site_id": "SITE-101",
                "stand_id": "STAND-001",
                "project_name": "Highlands Royal Villa (Takudzwa Kunaka)",
                "material_id": "MAT-CEMENT-32",
                "material_name": "Portland Cement (PC15 50kg)",
                "quantity": 250,
                "unit": "bags",
                "stage": "Stage 2: Superstructure",
                "authorized_by": "Eng. Tendai Chiweshe",
                "foreman": "Foreman Garikai Sithole",
                "status": "DELIVERED_ON_SITE"
            },
            {
                "dispatch_id": "DSP-2026-103",
                "date": "2026-10-08 14:00",
                "site_id": "SITE-102",
                "stand_id": "STAND-002",
                "project_name": "Highlands Executive (Tendai Mupfumira)",
                "material_id": "MAT-CEMENT-42",
                "material_name": "High-Strength Cement (42.5N)",
                "quantity": 180,
                "unit": "bags",
                "stage": "Stage 1: Substructure Slab",
                "authorized_by": "Eng. Kudzai Sithole",
                "foreman": "Foreman Tapiwa Zhou",
                "status": "DELIVERED_ON_SITE"
            }
        ]

    def get_stock_levels(self) -> List[Dict[str, Any]]:
        """Returns all materials with stock counts, status, and valuation."""
        items = []
        for mat_id, item in self.inventory.items():
            cost_usd = item["stock_on_hand"] * item["unit_cost_usd"]
            cost_zwg = cost_usd * self.fx_rate
            is_low = item["stock_on_hand"] <= item["reorder_level"]
            items.append({
                "material_id": mat_id,
                "name": item["name"],
                "category": item["category"],
                "unit": item["unit"],
                "stock_on_hand": item["stock_on_hand"],
                "reorder_level": item["reorder_level"],
                "unit_cost_usd": item["unit_cost_usd"],
                "total_valuation_usd": round(cost_usd, 2),
                "total_valuation_zwg": round(cost_zwg, 2),
                "is_low_stock": is_low,
                "supplier": item["supplier"],
                "status": "LOW_STOCK_REORDER" if is_low else "IN_STOCK"
            })
        return items

    def dispatch_material_to_site(
        self,
        site_id: str,
        stand_id: str,
        project_name: str,
        material_id: str,
        quantity: float,
        stage: str,
        authorized_by: str,
        foreman: str
    ) -> Dict[str, Any]:
        """
        Issues material from central warehouse to a construction site,
        deducts balance, checks reorder limits, and logs immutable audit trail.
        """
        if material_id not in self.inventory:
            return {"success": False, "error": f"Material ID {material_id} not found in catalog"}

        item = self.inventory[material_id]
        if item["stock_on_hand"] < quantity:
            return {
                "success": False,
                "error": f"Insufficient stock for {item['name']}. Available: {item['stock_on_hand']}, Requested: {quantity}"
            }

        # Deduct stock
        item["stock_on_hand"] -= quantity
        dispatch_ref = f"DSP-2026-{len(self.usage_log) + 101}"
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

        entry = {
            "dispatch_id": dispatch_ref,
            "date": timestamp,
            "site_id": site_id,
            "stand_id": stand_id,
            "project_name": project_name,
            "material_id": material_id,
            "material_name": item["name"],
            "quantity": quantity,
            "unit": item["unit"],
            "stage": stage,
            "authorized_by": authorized_by,
            "foreman": foreman,
            "status": "DELIVERED_ON_SITE"
        }
        self.usage_log.insert(0, entry)

        is_low = item["stock_on_hand"] <= item["reorder_level"]

        return {
            "success": True,
            "dispatch_id": dispatch_ref,
            "material_id": material_id,
            "material_name": item["name"],
            "quantity_dispatched": quantity,
            "remaining_stock": item["stock_on_hand"],
            "is_low_stock": is_low,
            "dispatch_entry": entry
        }

    def receive_stock_grn(
        self,
        material_id: str,
        quantity: float,
        supplier: str,
        invoice_ref: str,
        received_by: str
    ) -> Dict[str, Any]:
        """
        Logs a Goods Received Note (GRN) adding stock to warehouse.
        """
        if material_id not in self.inventory:
            return {"success": False, "error": "Invalid material ID"}

        self.inventory[material_id]["stock_on_hand"] += quantity
        grn_ref = f"GRN-2026-{datetime.date.today().strftime('%m%d')}-{material_id.replace('MAT-', '')}"

        return {
            "success": True,
            "grn_ref": grn_ref,
            "material_name": self.inventory[material_id]["name"],
            "quantity_added": quantity,
            "new_stock_level": self.inventory[material_id]["stock_on_hand"],
            "supplier": supplier,
            "invoice_ref": invoice_ref,
            "received_by": received_by
        }
