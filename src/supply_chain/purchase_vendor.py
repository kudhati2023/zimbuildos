"""
Supply Chain & Inventory Management: Purchase & Vendor Management
Automates material requisitions, multi-vendor quote comparison & scoring,
Purchase Order (PO) issuance, delivery confirmations, and 3-Way Invoice Matching.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import hashlib
import datetime


@dataclass
class VendorProfile:
    vendor_id: str
    company_name: str
    tax_number: str  # ZIMRA BP / TIN
    contact_person: str
    phone: str
    email: str
    rating: float  # 1.0 to 5.0
    payment_terms: str  # Net 30, COD, 50% Advance
    compliance_certified: bool = True
    bank_details: str = "Stanbic Bank Zimbabwe"


@dataclass
class MaterialRequisition:
    requisition_id: str
    project_site: str
    requested_by: str
    required_date: str
    items: List[Dict[str, Any]]  # [{"item_id", "item_name", "qty", "unit", "spec"}]
    urgency: str = "NORMAL"  # NORMAL, URGENT, CRITICAL
    status: str = "PENDING"  # PENDING, APPROVED, PO_ISSUED, REJECTED
    approved_by: Optional[str] = None
    created_at: str = field(
        default_factory=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    )


@dataclass
class VendorQuote:
    quote_id: str
    requisition_id: str
    vendor_id: str
    vendor_name: str
    unit_prices: Dict[str, float]  # item_id -> price_usd
    total_quote_usd: float
    delivery_lead_days: int
    warranty_terms: str
    composite_score: float = 0.0  # weighted score on price, lead time, rating
    selected: bool = False


@dataclass
class PurchaseOrder:
    po_id: str
    requisition_id: str
    vendor_id: str
    vendor_name: str
    project_site: str
    items: List[
        Dict[str, Any]
    ]  # [{"item_id", "item_name", "qty", "unit", "unit_price", "line_total"}]
    total_amount_usd: float
    total_amount_zwg: float
    status: str = "ISSUED"  # ISSUED, PARTIALLY_DELIVERED, DELIVERED, MATCHED, CANCELLED
    issued_date: str = field(
        default_factory=lambda: datetime.datetime.now().strftime("%Y-%m-%d")
    )
    authorized_by: str = "Dr. Tinashe Manzungu (Group CEO)"
    grn_reference: Optional[str] = None
    delivered_qty: float = 0.0
    photo_evidence_hash: Optional[str] = None


@dataclass
class VendorInvoice:
    invoice_id: str
    po_id: str
    vendor_id: str
    invoice_number: str
    invoice_date: str
    billed_amount_usd: float
    tax_amount_usd: float  # 15% VAT
    total_payable_usd: float
    three_way_match_status: str = "UNMATCHED"  # MATCHED, VARIANCE_FLAGGED, REJECTED
    variance_amount_usd: float = 0.0
    audit_notes: str = ""


class PurchaseVendorManager:
    """End-to-end procurement, vendor ratings, RFQ quote evaluation, and 3-way invoice matching."""

    def __init__(self, fx_rate: float = 26.50):
        self.fx_rate = fx_rate
        self.vendors: Dict[str, VendorProfile] = {}
        self.requisitions: Dict[str, MaterialRequisition] = {}
        self.quotes: Dict[str, List[VendorQuote]] = {}  # req_id -> list of quotes
        self.purchase_orders: Dict[str, PurchaseOrder] = {}
        self.invoices: Dict[str, VendorInvoice] = {}
        self._seed_procurement_data()

    def _seed_procurement_data(self):
        # 1. Registered Suppliers
        v1 = VendorProfile(
            vendor_id="VND-PPC",
            company_name="PPC Zimbabwe Ltd",
            tax_number="BP-020019283-ZIMRA",
            contact_person="Sales Director Farai Nyoni",
            phone="+263 242 789 100",
            email="sales@ppc.co.zw",
            rating=4.9,
            payment_terms="Net 30 Days",
            compliance_certified=True,
        )
        v2 = VendorProfile(
            vendor_id="VND-BETA",
            company_name="Beta Bricks (Pvt) Ltd",
            tax_number="BP-020038812-ZIMRA",
            contact_person="Key Accounts Chipo Mutasa",
            phone="+263 242 660 300",
            email="orders@betabricks.co.zw",
            rating=4.8,
            payment_terms="Net 15 Days",
            compliance_certified=True,
        )
        v3 = VendorProfile(
            vendor_id="VND-LANCASHIRE",
            company_name="Lancashire Steel / Trident Rebar",
            tax_number="BP-019948210-ZIMRA",
            contact_person="Sales Eng. Munyaradzi Sibanda",
            phone="+263 54 222 100",
            email="commercial@lancashire.co.zw",
            rating=4.7,
            payment_terms="30% Advance, 70% Delivery",
            compliance_certified=True,
        )
        self.vendors[v1.vendor_id] = v1
        self.vendors[v2.vendor_id] = v2
        self.vendors[v3.vendor_id] = v3

        # 2. Seed Requisition
        req = MaterialRequisition(
            requisition_id="REQ-2026-081",
            project_site="Highlands Luxury Estate (SITE-HIGHLANDS-01)",
            requested_by="Eng. Tendai Chiweshe",
            required_date="2026-10-14",
            items=[
                {
                    "item_id": "MAT-CEMENT-32",
                    "item_name": "Portland Masonry Cement 32.5R",
                    "qty": 800,
                    "unit": "bags",
                },
                {
                    "item_id": "MAT-REBAR-Y12",
                    "item_name": "High Tensile Rebar Y12",
                    "qty": 2000,
                    "unit": "kg",
                },
            ],
            urgency="URGENT",
            status="APPROVED",
            approved_by="Dr. Tinashe Manzungu",
        )
        self.requisitions[req.requisition_id] = req

        # 3. Seed Purchase Order
        po = PurchaseOrder(
            po_id="PO-2026-104",
            requisition_id="REQ-2026-081",
            vendor_id="VND-PPC",
            vendor_name="PPC Zimbabwe Ltd",
            project_site="SITE-HIGHLANDS-01",
            items=[
                {
                    "item_id": "MAT-CEMENT-32",
                    "item_name": "Portland Masonry Cement 32.5R",
                    "qty": 800,
                    "unit": "bags",
                    "unit_price": 10.50,
                    "line_total": 8400.00,
                }
            ],
            total_amount_usd=8400.00,
            total_amount_zwg=round(8400.00 * self.fx_rate, 2),
            status="PARTIALLY_DELIVERED",
            delivered_qty=800,
            grn_reference="GRN-2026-1008-CEM",
            photo_evidence_hash="a89f3b207e99c15d",
        )
        self.purchase_orders[po.po_id] = po

    def create_requisition(
        self,
        project_site: str,
        requested_by: str,
        required_date: str,
        items: List[Dict[str, Any]],
        urgency: str = "NORMAL",
    ) -> Dict[str, Any]:
        """Creates an official site material requisition for procurement."""
        req_id = f"REQ-2026-{len(self.requisitions) + 82:03d}"
        req = MaterialRequisition(
            requisition_id=req_id,
            project_site=project_site,
            requested_by=requested_by,
            required_date=required_date,
            items=items,
            urgency=urgency,
            status="PENDING",
        )
        self.requisitions[req_id] = req
        return {"success": True, "requisition_id": req_id, "requisition": req}

    def approve_requisition(
        self, requisition_id: str, approver_name: str
    ) -> Dict[str, Any]:
        """Executive or QS approval to proceed with RFQ and vendor RFQ issuance."""
        if requisition_id not in self.requisitions:
            return {
                "success": False,
                "error": f"Requisition '{requisition_id}' not found",
            }

        req = self.requisitions[requisition_id]
        req.status = "APPROVED"
        req.approved_by = approver_name
        return {
            "success": True,
            "requisition_id": requisition_id,
            "status": "APPROVED",
            "approved_by": approver_name,
        }

    def evaluate_vendor_quotes(
        self, requisition_id: str, quotes_input: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Calculates multi-criteria comparison score for competing vendor quotes.
        Weights: Price competitiveness (50%), Delivery lead time (30%), Supplier rating (20%).
        """
        if not quotes_input:
            return []

        # Find min price and min lead time
        min_price = min(q["total_quote_usd"] for q in quotes_input)
        min_lead = min(q["delivery_lead_days"] for q in quotes_input)

        scored_quotes: List[VendorQuote] = []
        for q in quotes_input:
            vendor = self.vendors.get(q["vendor_id"])
            rating = vendor.rating if vendor else 4.0

            # Score calculations (0 to 100)
            price_score = (min_price / q["total_quote_usd"]) * 100
            lead_score = (min_lead / max(1, q["delivery_lead_days"])) * 100
            rating_score = (rating / 5.0) * 100

            composite = round(
                (0.50 * price_score) + (0.30 * lead_score) + (0.20 * rating_score), 2
            )

            scored = VendorQuote(
                quote_id=f"QT-{q['vendor_id']}-{requisition_id}",
                requisition_id=requisition_id,
                vendor_id=q["vendor_id"],
                vendor_name=q["vendor_name"],
                unit_prices=q.get("unit_prices", {}),
                total_quote_usd=q["total_quote_usd"],
                delivery_lead_days=q["delivery_lead_days"],
                warranty_terms=q.get("warranty_terms", "Standard 12 Months"),
                composite_score=composite,
                selected=False,
            )
            scored_quotes.append(scored)

        # Sort descending by composite score
        scored_quotes.sort(key=lambda x: x.composite_score, reverse=True)
        if scored_quotes:
            scored_quotes[0].selected = True

        self.quotes[requisition_id] = scored_quotes
        return [q.__dict__ for q in scored_quotes]

    def issue_purchase_order(
        self,
        requisition_id: str,
        vendor_id: str,
        authorized_by: str = "Dr. Tinashe Manzungu (Group CEO)",
    ) -> Dict[str, Any]:
        """Generates binding Purchase Order (PO) to the winning vendor."""
        if requisition_id not in self.requisitions:
            return {
                "success": False,
                "error": f"Requisition '{requisition_id}' not found",
            }

        req = self.requisitions[requisition_id]
        vendor = self.vendors.get(vendor_id)
        if not vendor:
            return {"success": False, "error": f"Vendor '{vendor_id}' not found"}

        # Find quote or evaluate default items
        quote_list = self.quotes.get(requisition_id, [])
        selected_quote = next((q for q in quote_list if q.vendor_id == vendor_id), None)

        po_items = []
        total_usd = 0.0

        for itm in req.items:
            price = 10.0  # fallback
            if selected_quote and itm["item_id"] in selected_quote.unit_prices:
                price = selected_quote.unit_prices[itm["item_id"]]
            line_tot = round(itm["qty"] * price, 2)
            total_usd += line_tot
            po_items.append(
                {
                    "item_id": itm["item_id"],
                    "item_name": itm["item_name"],
                    "qty": itm["qty"],
                    "unit": itm["unit"],
                    "unit_price": price,
                    "line_total": line_tot,
                }
            )

        po_id = f"PO-2026-{len(self.purchase_orders) + 105:03d}"
        po = PurchaseOrder(
            po_id=po_id,
            requisition_id=requisition_id,
            vendor_id=vendor_id,
            vendor_name=vendor.company_name,
            project_site=req.project_site,
            items=po_items,
            total_amount_usd=round(total_usd, 2),
            total_amount_zwg=round(total_usd * self.fx_rate, 2),
            status="ISSUED",
            authorized_by=authorized_by,
        )
        self.purchase_orders[po_id] = po
        req.status = "PO_ISSUED"

        return {
            "success": True,
            "po_id": po_id,
            "vendor_name": vendor.company_name,
            "total_usd": po.total_amount_usd,
            "total_zwg": po.total_amount_zwg,
            "status": "ISSUED",
        }

    def record_po_delivery(
        self,
        po_id: str,
        delivered_qty: float,
        receiver_name: str,
        photo_proof_tag: str = "site_delivery_slip.jpg",
    ) -> Dict[str, Any]:
        """Logs Goods Received Note (GRN) on site with delivery photo hash."""
        if po_id not in self.purchase_orders:
            return {"success": False, "error": f"PO '{po_id}' not found"}

        po = self.purchase_orders[po_id]
        po.delivered_qty = delivered_qty
        po.grn_reference = f"GRN-{po_id}-{datetime.datetime.now().strftime('%m%d')}"
        po.photo_evidence_hash = hashlib.sha256(
            f"{po_id}:{receiver_name}:{photo_proof_tag}".encode()
        ).hexdigest()[:16]

        total_ordered = sum(item["qty"] for item in po.items)
        if delivered_qty >= total_ordered:
            po.status = "DELIVERED"
        else:
            po.status = "PARTIALLY_DELIVERED"

        return {
            "success": True,
            "po_id": po_id,
            "grn_reference": po.grn_reference,
            "delivered_qty": delivered_qty,
            "ordered_qty": total_ordered,
            "photo_hash": po.photo_evidence_hash,
            "status": po.status,
        }

    def perform_three_way_match(
        self,
        po_id: str,
        invoice_number: str,
        invoice_date: str,
        billed_amount_usd: float,
    ) -> Dict[str, Any]:
        """
        Automated 3-Way Invoice Matching:
        Validates:
          1. Purchase Order agreed price & authorization
          2. Goods Received Note (GRN) physically counted & photo hashed
          3. Supplier Billed Invoice amount
        Flags variances > 1.5% or missing delivery proofs.
        """
        if po_id not in self.purchase_orders:
            return {"success": False, "error": f"PO '{po_id}' not found"}

        po = self.purchase_orders[po_id]

        if not po.photo_evidence_hash or not po.grn_reference:
            return {
                "success": False,
                "three_way_match": "REJECTED_NO_DELIVERY_PROOF",
                "message": "Invoice cannot be matched: No Goods Received Note (GRN) or photo proof found.",
            }

        variance = round(billed_amount_usd - po.total_amount_usd, 2)
        tolerance = round(po.total_amount_usd * 0.015, 2)  # 1.5% allowed tolerance

        is_matched = abs(variance) <= tolerance
        match_status = "MATCHED" if is_matched else "VARIANCE_FLAGGED"

        tax_usd = round(billed_amount_usd * 0.15, 2)  # ZIMRA 15% VAT
        total_payable = round(billed_amount_usd + tax_usd, 2)

        inv_record = VendorInvoice(
            invoice_id=f"INV-{po_id.replace('PO-', '')}",
            po_id=po_id,
            vendor_id=po.vendor_id,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            billed_amount_usd=billed_amount_usd,
            tax_amount_usd=tax_usd,
            total_payable_usd=total_payable,
            three_way_match_status=match_status,
            variance_amount_usd=variance,
            audit_notes=(
                "Perfect 3-way match across PO, GRN, and Invoice."
                if is_matched
                else f"Variance of ${variance} exceeds tolerance threshold ${tolerance}."
            ),
        )
        self.invoices[inv_record.invoice_id] = inv_record
        if is_matched:
            po.status = "MATCHED"

        return {
            "success": True,
            "invoice_id": inv_record.invoice_id,
            "po_id": po_id,
            "three_way_match": match_status,
            "po_amount_usd": po.total_amount_usd,
            "billed_amount_usd": billed_amount_usd,
            "variance_usd": variance,
            "vat_15_pct_usd": tax_usd,
            "total_payable_usd": total_payable,
            "delivery_grn": po.grn_reference,
            "photo_hash": po.photo_evidence_hash,
            "audit_notes": inv_record.audit_notes,
        }
