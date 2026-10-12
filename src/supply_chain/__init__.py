"""
Unified Supply Chain & Inventory Management Coordinator
Provides integrated facades for WMS, Purchase & Vendor, and Manufacturing PLM.
"""

from typing import Dict, Any, List
from .warehouse_wms import WarehouseManagementSystem, StockItem, WarehouseLocation, StockTransferNote
from .purchase_vendor import PurchaseVendorManager, VendorProfile, MaterialRequisition, VendorQuote, PurchaseOrder, VendorInvoice
from .manufacturing_plm import ManufacturingPLMManager, BillOfMaterials, BOMComponent, ProductionWorkOrder, EngineeringChangeOrder

class SupplyChainCoordinator:
    """Unified coordinator connecting WMS, Purchasing & Vendors, and Manufacturing (MRP/PLM)."""

    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.wms = WarehouseManagementSystem(fx_rate=fx_rate)
        self.purchasing = PurchaseVendorManager(fx_rate=fx_rate)
        self.manufacturing = ManufacturingPLMManager(fx_rate=fx_rate)

    def execute_automated_replenishment(self, item_id: str, quantity: float, target_site: str = "WH-CENTRAL-HAR") -> Dict[str, Any]:
        """
        End-to-End Workflow:
        1. Checks WMS low-stock trigger
        2. Raises automated Material Requisition
        3. Generates PO to Primary Vendor
        4. Simulates GRN receipt into WMS
        5. Performs 3-Way match against Supplier Invoice
        """
        if item_id not in self.wms.catalog:
            return {"success": False, "error": f"Item '{item_id}' not found in catalog"}

        stock_item = self.wms.catalog[item_id]

        # 1. Create Requisition
        req_res = self.purchasing.create_requisition(
            project_site=target_site,
            requested_by="Autonomous Inventory Optimization Bot",
            required_date="2026-10-15",
            items=[{"item_id": item_id, "item_name": stock_item.name, "qty": quantity, "unit": stock_item.unit}],
            urgency="URGENT" if stock_item.is_low_stock else "NORMAL"
        )
        req_id = req_res["requisition_id"]

        # 2. Executive Approval
        self.purchasing.approve_requisition(req_id, "Dr. Tinashe Manzungu (Group CEO)")

        # 3. Find primary vendor or fallback
        vendor_id = "VND-PPC" if "CEMENT" in item_id else ("VND-BETA" if "BRICK" in item_id else "VND-LANCASHIRE")

        # 4. Issue PO
        po_res = self.purchasing.issue_purchase_order(req_id, vendor_id)
        po_id = po_res["po_id"]

        # 5. Delivery on site/warehouse
        deliv_res = self.purchasing.record_po_delivery(po_id, quantity, "Receiver Clerk Moyo", "truck_inbound_grn.jpg")

        # 6. Inbound into WMS stock
        self.wms.record_direct_receipt(
            item_id=item_id,
            quantity=quantity,
            target_location=target_site,
            lot_number=f"LOT-AUTO-{datetime_str()}",
            supplier=self.purchasing.vendors[vendor_id].company_name
        )

        # 7. 3-Way Match
        inv_res = self.purchasing.perform_three_way_match(
            po_id=po_id,
            invoice_number=f"INV-AUTO-{po_id[-3:]}",
            invoice_date="2026-10-10",
            billed_amount_usd=po_res["total_usd"]
        )

        return {
            "success": True,
            "replenishment_item": stock_item.name,
            "quantity": quantity,
            "requisition_id": req_id,
            "po_id": po_id,
            "grn_reference": deliv_res["grn_reference"],
            "three_way_match": inv_res["three_way_match"],
            "new_stock_level": self.wms.catalog[item_id].total_stock_on_hand
        }

    def assemble_and_stock_prefab(self, product_code: str, quantity: int, destination_site: str = "SITE-HIGHLANDS-01") -> Dict[str, Any]:
        """
        MRP to WMS Inbound Workflow:
        1. Explodes raw materials required
        2. Deducts component materials from WMS central stores
        3. Runs Manufacturing assembly work order
        4. Records finished prefabrication units into WMS active site inventory
        """
        bom = self.manufacturing.get_bom_by_product_code(product_code)
        if not bom:
            return {"success": False, "error": f"BOM not found for {product_code}"}

        # Check stock of components
        for comp in bom.components:
            needed = comp.required_quantity * quantity
            if comp.raw_material_id in self.wms.catalog:
                curr_stock = self.wms.catalog[comp.raw_material_id].central_store_qty
                if curr_stock < needed:
                    return {
                        "success": False,
                        "error": f"Insufficient raw material '{comp.material_name}'. Needs {needed}, has {curr_stock}"
                    }

        # Deduct raw materials from Central Store
        deducted = []
        for comp in bom.components:
            needed = comp.required_quantity * quantity
            if comp.raw_material_id in self.wms.catalog:
                self.wms.catalog[comp.raw_material_id].central_store_qty -= needed
                deducted.append({"material": comp.material_name, "quantity_deducted": needed})

        # Launch and complete assembly
        wo_res = self.manufacturing.launch_production_work_order(product_code, quantity)
        wo_id = wo_res["work_order_id"]
        comp_res = self.manufacturing.complete_production_batch(wo_id, quantity, qc_pass_rate_pct=99.2)

        # Inbound finished units into WMS target site
        inbound_res = self.wms.record_direct_receipt(
            item_id=product_code,
            quantity=float(quantity),
            target_location=destination_site,
            lot_number=f"LOT-ASY-{datetime_str()}",
            supplier="Zimbuild In-House Prefabrication Works"
        )

        return {
            "success": True,
            "product_code": product_code,
            "product_name": bom.product_name,
            "quantity_manufactured": quantity,
            "work_order_id": wo_id,
            "qc_pass_rate_pct": comp_res["qc_pass_rate_pct"],
            "destination_site": destination_site,
            "inbound_stock": inbound_res["new_total_stock"],
            "raw_materials_consumed": deducted
        }

def datetime_str():
    import datetime
    return datetime.datetime.now().strftime("%m%d%H%M")
