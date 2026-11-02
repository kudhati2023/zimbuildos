import pytest
from src.inventory.materials_inventory import MaterialsInventoryManager


def test_inventory_levels():
    mgr = MaterialsInventoryManager(fx_rate=26.50)
    stock = mgr.get_stock_levels()
    assert len(stock) >= 10
    cement = next(s for s in stock if s["material_id"] == "MAT-CEMENT-32")
    assert cement["stock_on_hand"] == 4200
    assert cement["status"] == "IN_STOCK"


def test_dispatch_material_to_site():
    mgr = MaterialsInventoryManager(fx_rate=26.50)
    res = mgr.dispatch_material_to_site(
        site_id="SITE-101",
        stand_id="STAND-001",
        project_name="Highlands Royal Villa",
        material_id="MAT-BRICK",
        quantity=5000,
        stage="Stage 2: Superstructure",
        authorized_by="Eng. Tendai Chiweshe",
        foreman="Foreman Garikai",
    )
    assert res["success"] is True
    assert res["remaining_stock"] == 180000
    assert len(mgr.usage_log) == 4
    assert mgr.usage_log[0]["quantity"] == 5000


def test_insufficient_stock_prevention():
    mgr = MaterialsInventoryManager(fx_rate=26.50)
    res = mgr.dispatch_material_to_site(
        site_id="SITE-101",
        stand_id="STAND-001",
        project_name="Highlands Royal Villa",
        material_id="MAT-PAINT",
        quantity=99999,
        stage="Stage 6: Finishes",
        authorized_by="Eng. Tendai Chiweshe",
        foreman="Foreman Garikai",
    )
    assert res["success"] is False
    assert "Insufficient stock" in res["error"]


def test_goods_received_note():
    mgr = MaterialsInventoryManager(fx_rate=26.50)
    res = mgr.receive_stock_grn(
        material_id="MAT-CEMENT-32",
        quantity=500,
        supplier="PPC Zimbabwe",
        invoice_ref="INV-9902",
        received_by="Stores Clerk Moyo",
    )
    assert res["success"] is True
    assert res["new_stock_level"] == 4700
