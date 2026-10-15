"""
Unit & Integration Tests for Supply Chain & Inventory Management Suite:
1. Inventory & Warehouse Management (WMS): Central store, site allocations, transfers, reconciliations.
2. Purchase & Vendor Management: Requisitions, vendor quote scoring, PO issuance, delivery, 3-way match.
3. Manufacturing (MRP) & PLM: Multi-level BOM, cost rollups, MRP explosion, ECO approvals, assembly work orders.
4. End-to-End Orchestration: Automated replenishment & prefab production-to-inventory cycle.
"""

import pytest
from src.supply_chain.warehouse_wms import WarehouseManagementSystem
from src.supply_chain.purchase_vendor import PurchaseVendorManager
from src.supply_chain.manufacturing_plm import ManufacturingPLMManager
from src.supply_chain import SupplyChainCoordinator


def test_wms_stock_overview_and_valuation():
    wms = WarehouseManagementSystem(fx_rate=26.50)
    overview = wms.get_stock_overview()
    assert len(overview) >= 9

    brick = next(i for i in overview if i["item_id"] == "MAT-BRICK")
    assert brick["central_store_qty"] == 160000
    assert brick["site_allocations"]["SITE-HIGHLANDS-01"] == 25000
    assert brick["total_stock_on_hand"] == 200000
    assert brick["total_valuation_usd"] == round(200000 * 0.12, 2)
    assert brick["total_valuation_zwg"] == round(brick["total_valuation_usd"] * 26.50, 2)


def test_wms_transfer_and_site_reconciliation():
    wms = WarehouseManagementSystem(fx_rate=26.50)
    res = wms.transfer_material(
        source_loc="WH-CENTRAL-HAR",
        dest_loc="SITE-KADOMA-02",
        item_id="MAT-CEMENT-32",
        quantity=500,
        requested_by="Foreman Tapiwa Zhou",
        authorized_by="Eng. Tendai Chiweshe",
        dispatched_by="Stores Clerk Moyo"
    )
    assert res["success"] is True
    assert res["status"] == "IN_TRANSIT"
    assert res["central_store_balance"] == 3000 # 3500 - 500
    assert res["site_balance"] == 750 # 250 + 500

    # Confirm receipt at site
    rec_res = wms.confirm_transfer_receipt(res["transfer_id"], "Tapiwa Zhou")
    assert rec_res["success"] is True
    assert rec_res["status"] == "DELIVERED"


def test_wms_insufficient_stock_guard():
    wms = WarehouseManagementSystem(fx_rate=26.50)
    res = wms.transfer_material(
        source_loc="WH-CENTRAL-HAR",
        dest_loc="SITE-HIGHLANDS-01",
        item_id="MAT-ROOF-CHROMA",
        quantity=999999,
        requested_by="Foreman Garikai",
        authorized_by="Eng. Tendai Chiweshe",
        dispatched_by="Clerk Moyo"
    )
    assert res["success"] is False
    assert "Insufficient stock" in res["error"]


def test_purchase_vendor_quote_comparison():
    pvm = PurchaseVendorManager(fx_rate=26.50)
    
    # 1. Create Requisition
    req_res = pvm.create_requisition(
        project_site="Highlands Phase 2",
        requested_by="Eng. Tendai Chiweshe",
        required_date="2026-10-20",
        items=[{"item_id": "MAT-CEMENT-32", "item_name": "Cement 32.5R", "qty": 1000, "unit": "bags"}]
    )
    assert req_res["success"] is True
    req_id = req_res["requisition_id"]

    # 2. Compare 3 Vendor Quotes
    quotes_data = [
        {"vendor_id": "VND-PPC", "vendor_name": "PPC Zimbabwe", "total_quote_usd": 10500.0, "delivery_lead_days": 2, "unit_prices": {"MAT-CEMENT-32": 10.50}},
        {"vendor_id": "VND-BETA", "vendor_name": "Beta Bricks Logistics", "total_quote_usd": 11200.0, "delivery_lead_days": 4, "unit_prices": {"MAT-CEMENT-32": 11.20}},
        {"vendor_id": "VND-LANCASHIRE", "vendor_name": "Midlands Supplier", "total_quote_usd": 12000.0, "delivery_lead_days": 5, "unit_prices": {"MAT-CEMENT-32": 12.00}},
    ]
    ranked = pvm.evaluate_vendor_quotes(req_id, quotes_data)
    assert len(ranked) == 3
    # First ranked quote should be PPC (lowest price, shortest lead time, high rating)
    assert ranked[0]["vendor_id"] == "VND-PPC"
    assert ranked[0]["selected"] is True
    assert ranked[0]["composite_score"] > ranked[1]["composite_score"]


def test_purchase_order_and_three_way_invoice_match():
    pvm = PurchaseVendorManager(fx_rate=26.50)
    req = pvm.create_requisition(
        project_site="SITE-HIGHLANDS-01",
        requested_by="Eng. Chiweshe",
        required_date="2026-10-18",
        items=[{"item_id": "MAT-REBAR-Y12", "item_name": "Rebar Y12", "qty": 1000, "unit": "kg"}]
    )
    pvm.approve_requisition(req["requisition_id"], "Dr. Tinashe Manzungu")
    po_res = pvm.issue_purchase_order(req["requisition_id"], "VND-LANCASHIRE")
    assert po_res["success"] is True
    po_id = po_res["po_id"]

    # Delivery verification
    deliv = pvm.record_po_delivery(po_id, 1000, "Foreman Garikai", "delivery_slip_hash_xyz")
    assert deliv["success"] is True
    assert deliv["photo_hash"] is not None

    # 3-Way Invoice Match
    match_res = pvm.perform_three_way_match(
        po_id=po_id,
        invoice_number="INV-LAN-2026-902",
        invoice_date="2026-10-12",
        billed_amount_usd=po_res["total_usd"]
    )
    assert match_res["success"] is True
    assert match_res["three_way_match"] == "MATCHED"
    assert match_res["variance_usd"] == 0.0
    assert match_res["vat_15_pct_usd"] > 0


def test_manufacturing_mrp_bom_and_cost_rollup():
    mrp = ManufacturingPLMManager(fx_rate=26.50)
    bom_details = mrp.get_bom_details("BOM-WALL-2026-A")
    assert bom_details is not None
    assert bom_details["product_code"] == "PREFAB-WALL-STD"
    assert bom_details["raw_materials_cost_usd"] > 0
    assert bom_details["direct_labor_cost_usd"] > 0
    assert bom_details["unit_production_cost_usd"] > 100.0

    # Explode requirements for 100 wall panels
    explosion = mrp.explode_mrp_requirements("PREFAB-WALL-STD", target_quantity=100)
    assert explosion["success"] is True
    assert explosion["target_quantity"] == 100
    assert len(explosion["material_requirements"]) == 5
    assert explosion["total_labor_hours"] == 450.0
    assert explosion["grand_total_production_usd"] > 10000.0


def test_manufacturing_plm_eco_workflow():
    mrp = ManufacturingPLMManager(fx_rate=26.50)
    eco = mrp.submit_engineering_change_order(
        product_code="PREFAB-TRUSS-6M",
        title="Incorporate Anti-Corrosive Zinc Coatings",
        justification="Enhances lifespan in humid sub-tropical climates.",
        old_revision="Rev A",
        new_revision="Rev B",
        requested_by="Eng. Blessing Musona"
    )
    assert eco["success"] is True
    eco_id = eco["eco_id"]

    approval = mrp.approve_and_implement_eco(eco_id, "Dr. Tinashe Manzungu (Group CEO)")
    assert approval["success"] is True
    assert approval["status"] == "IMPLEMENTED"
    assert mrp.bom_registry["BOM-TRUSS-6M-A"].revision == "Rev B"


def test_supply_chain_coordinator_end_to_end():
    coordinator = SupplyChainCoordinator(fx_rate=26.50)

    # 1. Automated Replenishment of Cement
    replenish = coordinator.execute_automated_replenishment("MAT-CEMENT-32", quantity=200, target_site="WH-CENTRAL-HAR")
    assert replenish["success"] is True
    assert replenish["three_way_match"] == "MATCHED"
    assert replenish["new_stock_level"] >= 4400 # was 4200 initial total stock + 200

    # 2. Manufacturing Assembly Run of Prefab Walls
    assembly = coordinator.assemble_and_stock_prefab("PREFAB-WALL-STD", quantity=5, destination_site="SITE-HIGHLANDS-01")
    assert assembly["success"] is True
    assert assembly["quantity_manufactured"] == 5
    assert assembly["qc_pass_rate_pct"] > 98.0
    assert assembly["inbound_stock"] >= 85 # previously 80 + 5

def test_assemble_and_stock_prefab_exact_deductions():
    coordinator = SupplyChainCoordinator(fx_rate=26.50)

    product_code = "PREFAB-WALL-STD"
    quantity = 2
    destination = "SITE-KADOMA-02"

    # Capture initial central store quantities for raw materials
    bom = next(b for b in coordinator.manufacturing.bom_registry.values() if b.product_code == product_code)

    initial_stock = {}
    for comp in bom.components:
        if comp.raw_material_id in coordinator.wms.catalog:
            initial_stock[comp.raw_material_id] = coordinator.wms.catalog[comp.raw_material_id].central_store_qty

    initial_prefab_qty = coordinator.wms.catalog[product_code].site_allocations.get(destination, 0)

    # Perform assembly
    result = coordinator.assemble_and_stock_prefab(product_code, quantity, destination_site=destination)

    assert result["success"] is True

    # Verify exact deductions
    for comp in bom.components:
        if comp.raw_material_id in coordinator.wms.catalog:
            expected_deduction = comp.required_quantity * quantity
            current_stock = coordinator.wms.catalog[comp.raw_material_id].central_store_qty
            assert current_stock == initial_stock[comp.raw_material_id] - expected_deduction

    # Verify stock addition at target site
    current_prefab_qty = coordinator.wms.catalog[product_code].site_allocations.get(destination, 0)
    assert current_prefab_qty == initial_prefab_qty + quantity


def test_assemble_and_stock_prefab_bom_not_found():
    coordinator = SupplyChainCoordinator(fx_rate=26.50)
    result = coordinator.assemble_and_stock_prefab("INVALID-CODE-123", 10)

    assert result["success"] is False
    assert "BOM not found" in result["error"]


def test_assemble_and_stock_prefab_insufficient_stock():
    coordinator = SupplyChainCoordinator(fx_rate=26.50)
    product_code = "PREFAB-WALL-STD"

    bom = next(b for b in coordinator.manufacturing.bom_registry.values() if b.product_code == product_code)
    comp = bom.components[0]

    # Intentionally empty the central stock for one component
    coordinator.wms.catalog[comp.raw_material_id].central_store_qty = 0

    result = coordinator.assemble_and_stock_prefab(product_code, 1)

    assert result["success"] is False
    assert "Insufficient raw material" in result["error"]
