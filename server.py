"""
Zimbuild Enterprise Secure ERP Backend Server
Combines static web serving with security headers, RBAC verification,
and REST API endpoints mapped to all core ERP and construction engines.
"""

import http.server
import socketserver
import json
import os
import urllib.parse
from datetime import datetime
from typing import Dict, Any

from src.security.security_guard import security_guard, SecurityGuard
from src.erp.portfolio_manager import PortfolioManager
from src.erp.lease_tenant_manager import LeaseTenantManager
from src.erp.job_costing_tender import JobCostingTenderManager
from src.erp.site_operations import SiteOperationsManager
from src.erp.financial_tax_engine import FinancialTaxEngine
from src.erp.dlap_registry_engine import DLAPRegistryEngine
from src.erp.lean_toc_engine import LeanTOCEngine
from src.inventory.materials_inventory import MaterialsInventoryManager
from src.construction.building_engine import BuildingEngine
from contracts.agreement_of_sale import LandSalesManager
from src.erp.sales_crm_pipeline import SalesCRMPipelineManager
from src.supply_chain import SupplyChainCoordinator
from src.erp.hr_payroll_manager import HRPayrollManager
from src.erp.fleet_appraisal_manager import FleetAppraisalManager
from src.erp.field_service_manager import FieldServiceManager
from src.erp.project_engineering_suite import (
    ProjectScheduleManager,
    QualityHSEManager,
    MortgageFinancingEngine,
    MunicipalPermitManager
)

PORT = int(os.environ.get("PORT", 8000))
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", 500))

# Initialize Singleton ERP Engines
portfolio_mgr = PortfolioManager()
lease_mgr = LeaseTenantManager()
job_costing_mgr = JobCostingTenderManager()
site_ops_mgr = SiteOperationsManager()
fintax_engine = FinancialTaxEngine(rbz_zwg_rate=26.50)
dlap_registry = DLAPRegistryEngine()
lean_engine = LeanTOCEngine()
inventory_mgr = MaterialsInventoryManager()
building_engine = BuildingEngine()
land_sales_mgr = LandSalesManager()
crm_mgr = SalesCRMPipelineManager(rbz_zwg_rate=26.50)
supply_chain_coordinator = SupplyChainCoordinator(fx_rate=26.50)
hr_mgr = HRPayrollManager(rbz_zwg_rate=26.50)
fleet_mgr = FleetAppraisalManager()
field_service_mgr = FieldServiceManager()
schedule_mgr = ProjectScheduleManager()
quality_mgr = QualityHSEManager()
mortgage_engine = MortgageFinancingEngine(rbz_zwg_rate=26.50)
permit_mgr = MunicipalPermitManager()

# In-Memory Datastores for Youth, Allocations & Messaging Gateway
youth_applicants_store = [
    {
        "applicant_id": "YOUTH-APP-2026-001",
        "full_name": "Tatenda Chitsike",
        "national_id": "63-2948192-A-24",
        "dob": "2002-04-12",
        "age": 24,
        "phone": "+263 772 123456",
        "email": "tatenda.chitsike@gmail.com",
        "scheme_preference": "KADOMA_YOUTH_SCHEME",
        "preferred_stand": "STAND-104",
        "annual_income_usd": 7200.0,
        "quota_verified": True,
        "registered_at": "2026-10-08T09:15:00Z",
        "status": "APPROVED_ALLOCATED"
    },
    {
        "applicant_id": "YOUTH-APP-2026-002",
        "full_name": "Ruvimbo Marufu",
        "national_id": "63-3104829-K-28",
        "dob": "1998-11-20",
        "age": 27,
        "phone": "+263 774 987654",
        "email": "ruvimbo.m@zimbuild.co.zw",
        "scheme_preference": "HIGHLANDS_STARTER_UNITS",
        "preferred_stand": "STAND-105",
        "annual_income_usd": 9600.0,
        "quota_verified": True,
        "registered_at": "2026-10-09T08:30:00Z",
        "status": "APPROVED_AWAITING_DEPOSIT"
    }
]

allocations_store = [
    {
        "allocation_id": "ALLOC-2026-001",
        "stand_id": "STAND-001",
        "buyer_name": "Takudzwa Kunaka",
        "buyer_id_redacted": "63-******-R-44",
        "buyer_phone": "+263 773 111222",
        "category": "HIGH_RISE_RESIDENTIAL",
        "total_cost_usd": 10000.0,
        "deposit_usd": 2500.0,
        "paid_to_date_usd": 7500.0,
        "balance_usd": 2500.0,
        "instalments_total": 24,
        "instalments_paid": 18,
        "next_due_date": "2026-10-25",
        "next_amount_usd": 312.50,
        "status": "ACTIVE_SERVICING",
        "title_deed_eligible": False
    },
    {
        "allocation_id": "ALLOC-2026-002",
        "stand_id": "STAND-002",
        "buyer_name": "Tendai Mupfumira",
        "buyer_id_redacted": "63-******-G-22",
        "buyer_phone": "+263 775 333444",
        "category": "HIGH_RISE_RESIDENTIAL",
        "total_cost_usd": 8500.0,
        "deposit_usd": 2000.0,
        "paid_to_date_usd": 8500.0,
        "balance_usd": 0.0,
        "instalments_total": 24,
        "instalments_paid": 24,
        "next_due_date": "N/A",
        "next_amount_usd": 0.0,
        "status": "FULLY_PAID_DEED_PENDING",
        "title_deed_eligible": True
    },
    {
        "allocation_id": "ALLOC-2026-003",
        "stand_id": "STAND-104",
        "buyer_name": "Tatenda Chitsike",
        "buyer_id_redacted": "63-******-A-24",
        "buyer_phone": "+263 772 123456",
        "category": "YOUTH_QUOTA",
        "total_cost_usd": 6500.0,
        "deposit_usd": 1500.0,
        "paid_to_date_usd": 2500.0,
        "balance_usd": 4000.0,
        "instalments_total": 36,
        "instalments_paid": 6,
        "next_due_date": "2026-10-28",
        "next_amount_usd": 138.89,
        "status": "ACTIVE_SERVICING",
        "title_deed_eligible": False
    }
]

outbound_messages_store = [
    {
        "message_id": "MSG-2026-101",
        "recipient": "+263 773 111222",
        "recipient_name": "Takudzwa Kunaka",
        "type": "WHATSAPP_REMINDER",
        "stand_id": "STAND-001",
        "text": "Dear Takudzwa Kunaka, your monthly installment of $312.50 USD for Stand STAND-001 is due on 2026-10-25. EcoCash Push available.",
        "status": "DELIVERED",
        "timestamp": "2026-10-09T08:00:00Z"
    },
    {
        "message_id": "MSG-2026-102",
        "recipient": "+263 772 123456",
        "recipient_name": "Tatenda Chitsike",
        "type": "SMS_RECEIPT",
        "stand_id": "STAND-104",
        "text": "Zimbuild Confirmation: Payment of $500.00 USD received via EcoCash for Stand STAND-104. Remaining balance: $4,000.00 USD.",
        "status": "DELIVERED",
        "timestamp": "2026-10-09T09:30:00Z"
    }
]

# ==============================================================================
# ISO/IEC 27001:2022 A.8.12 DATA LEAKAGE PREVENTION & PII MASKING HELPERS
# ==============================================================================
def mask_national_id(national_id: str) -> str:
    """Masks citizen national ID for data minimization (ISO A.8.12): 63-2948192-A-24 -> 63-******-A-24"""
    if not national_id:
        return ""
    parts = str(national_id).strip().split("-")
    if len(parts) == 4:
        return f"{parts[0]}-******-{parts[2]}-{parts[3]}"
    s = str(national_id).strip()
    return f"{s[:3]}******{s[-3:]}" if len(s) > 6 else "***"


def mask_phone_number(phone: str) -> str:
    """Masks phone number: +263 772 123456 -> +263 77****456"""
    if not phone:
        return ""
    s = str(phone).strip()
    return f"{s[:8]}****{s[-3:]}" if len(s) >= 11 else f"{s[:4]}****"


def mask_email_address(email: str) -> str:
    """Masks email address: tatenda.chitsike@gmail.com -> t***@gmail.com"""
    if not email or "@" not in str(email):
        return "***"
    user, domain = str(email).strip().split("@", 1)
    return f"{user[0]}***@{domain}"


class SecureERPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP Request Handler enforcing security headers and routing API calls."""

    def end_headers(self):
        # Enterprise Security Headers
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com https://server.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.opentopomap.org data: blob:;"
        )
        super().end_headers()

    def _get_allowed_origin(self) -> str:
        """Dynamically validates and resolves CORS origin (ISO 27001 A.8.26)."""
        origin = self.headers.get("Origin", "")
        configured_origins = os.environ.get("CORS_ORIGINS", "")
        if configured_origins:
            allowed_list = [o.strip() for o in configured_origins.split(",") if o.strip()]
            if origin in allowed_list:
                return origin
            if os.environ.get("NODE_ENV") == "production":
                return allowed_list[0] if allowed_list else "null"

        # Safe development/local origins
        if origin and (
            origin.startswith("http://localhost:") or
            origin.startswith("http://127.0.0.1:") or
            origin.startswith("tauri://") or
            origin.startswith("https://tauri.localhost")
        ):
            return origin

        return "*" if os.environ.get("NODE_ENV") != "production" else "null"

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests safely (ISO A.8.26)."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", self._get_allowed_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-User-Role, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def _send_json(self, status_code: int, data: Dict[str, Any]):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", self._get_allowed_origin())
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _check_rate_limit(self) -> bool:
        client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
        if not security_guard.check_rate_limit(client_ip, limit=RATE_LIMIT_MAX):
            security_guard.log_security_event(
                user_role="anonymous",
                action="RATE_LIMIT_EXCEEDED",
                details=f"Client IP {client_ip} exceeded sliding rate limit window",
                status="THROTTLED"
            )
            self._send_json(429, {
                "error": "Too Many Requests",
                "message": "Public request velocity threshold exceeded. Please try again shortly.",
                "security_status": "THROTTLED"
            })
            return False
        return True

    def _check_rbac(self, required_permission: str) -> bool:
        """Verifies caller has permission based on authenticated role (ISO 27001 A.8.26)."""
        raw_role = self.headers.get("X-User-Role")
        if not raw_role or not raw_role.strip():
            security_guard.log_security_event(
                user_role="anonymous",
                action="UNAUTHENTICATED_ACCESS_DENIED",
                details=f"Missing X-User-Role header for protected action '{required_permission}'.",
                status="DENIED"
            )
            self._send_json(401, {
                "error": "Unauthorized",
                "message": "Missing authentication credentials or X-User-Role header.",
                "security_status": "AUTHENTICATION_REQUIRED"
            })
            return False

        user_role = raw_role.strip().lower()
        if not security_guard.check_permission(user_role, required_permission):
            security_guard.log_security_event(
                user_role=user_role,
                action="PERMISSION_DENIED",
                details=f"Forbidden attempt by role '{user_role}' to execute '{required_permission}'.",
                status="DENIED"
            )
            self._send_json(403, {
                "error": "Forbidden",
                "message": f"Active role '{user_role}' is not authorized to execute '{required_permission}'.",
                "security_status": "BLOCKED_BY_RBAC_POLICY"
            })
            return False
        return True

    def _parse_post_body(self) -> Dict[str, Any]:
        """Safely parses JSON POST body with strict size bounds (ISO 27001 A.8.28 DoS protection)."""
        raw_cl = self.headers.get("Content-Length", "0")
        try:
            content_length = int(raw_cl)
        except (ValueError, TypeError):
            return {}
        if content_length <= 0:
            return {}
        # Enforce 1MB max body limit
        if content_length > 1_048_576:
            return {}
        body = self.rfile.read(content_length)
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        if not self._check_rate_limit():
            return

        url = urllib.parse.urlparse(self.path)
        path = url.path

        # REST API Routes
        if path.startswith("/api/"):
            user_role = (self.headers.get("X-User-Role") or "anonymous").strip().lower()

            if path == "/api/health":
                self._send_json(200, {"status": "HEALTHY", "service": "Zimbuild Secure ERP Gateway", "timestamp": "2026-10-09"})
                return

            if path == "/api/portfolio":
                if not self._check_rbac("view_portfolio"):
                    return
                self._send_json(200, portfolio_mgr.get_portfolio_summary())
                return

            if path == "/api/leases":
                if not self._check_rbac("view_leases"):
                    return
                leases_data = [
                    l.generate_lease_abstraction("Zimbuild Property", "Tenant")
                    for l in lease_mgr.leases.values()
                ]
                self._send_json(200, {"active_leases": leases_data})
                return

            if path == "/api/jobcosting":
                if not self._check_rbac("view_jobcosting"):
                    return
                self._send_json(200, job_costing_mgr.get_job_costing_summary())
                return

            if path == "/api/siteops/kpis":
                if not self._check_rbac("view_siteops"):
                    return
                self._send_json(200, site_ops_mgr.get_operations_kpi())
                return

            if path == "/api/inventory":
                if not self._check_rbac("view_inventory"):
                    return
                materials = inventory_mgr.get_stock_levels()
                self._send_json(200, {
                    "total_materials": len(materials),
                    "low_stock_count": sum(1 for m in materials if m["is_low_stock"]),
                    "total_valuation_usd": round(sum(m["total_valuation_usd"] for m in materials), 2),
                    "total_valuation_zwg": round(sum(m["total_valuation_zwg"] for m in materials), 2),
                    "materials": materials,
                })
                return

            if path == "/api/financials":
                if not self._check_rbac("view_financials"):
                    return
                pnl = fintax_engine.generate_ifrs_statement_of_profit_or_loss(
                    rental_revenue=150000.0,
                    construction_revenue=450000.0,
                    cost_of_sales=320000.0,
                    opex=85000.0
                )
                self._send_json(200, pnl)
                return

            if path == "/api/security/audit":
                if not self._check_rbac("view_audit_trail"):
                    return
                self._send_json(200, {"audit_trail": security_guard.get_audit_trail(100)})
                return

            if path == "/api/security/verify_ledger":
                if not self._check_rbac("view_audit_trail"):
                    return
                self._send_json(200, security_guard.verify_audit_log_integrity())
                return

            # CRM & Sales Pipeline GET Routes
            if path == "/api/crm/pipeline":
                if not self._check_rbac("view_crm"):
                    return
                self._send_json(200, crm_mgr.get_pipeline_summary())
                return

            if path == "/api/crm/inquiries":
                if not self._check_rbac("view_crm"):
                    return
                query = urllib.parse.parse_qs(url.query)
                st = query.get("status", [None])[0]
                ch = query.get("channel", [None])[0]
                diaspora = query.get("diaspora", [None])[0]
                is_d = True if diaspora == "true" else (False if diaspora == "false" else None)
                inquiries = crm_mgr.get_inquiries(status=st, source_channel=ch, is_diaspora=is_d)
                self._send_json(200, {"inquiries": inquiries, "total": len(inquiries)})
                return

            if path == "/api/crm/communications":
                if not self._check_rbac("view_crm"):
                    return
                query = urllib.parse.parse_qs(url.query)
                cust = query.get("customer", [None])[0]
                ref = query.get("ref", [None])[0]
                history = crm_mgr.get_communication_history(customer_id_or_name=cust, inquiry_or_deal_ref=ref)
                self._send_json(200, {"communications": history, "total": len(history)})
                return

            if path == "/api/crm/channels/metrics":
                if not self._check_rbac("view_crm"):
                    return
                self._send_json(200, crm_mgr.get_digital_channels_and_cx_metrics())
                return

            if path == "/api/crm/customer":
                if not self._check_rbac("view_crm"):
                    return
                query = urllib.parse.parse_qs(url.query)
                cid = query.get("id", [None])[0] or "CRM-CUST-101"
                self._send_json(200, crm_mgr.get_customer_360(cid))
                return

            # =========================================================
            # SUPPLY CHAIN & INVENTORY MANAGEMENT API ROUTES
            # =========================================================
            if path == "/api/supplychain/wms/stock":
                if not self._check_rbac("view_supply_chain"):
                    return
                stock = supply_chain_coordinator.wms.get_stock_overview()
                self._send_json(200, {"stock": stock, "locations": list(supply_chain_coordinator.wms.locations.keys())})
                return

            if path == "/api/supplychain/wms/transfers":
                if not self._check_rbac("view_supply_chain"):
                    return
                transfers = [t.__dict__ for t in supply_chain_coordinator.wms.transfer_history]
                self._send_json(200, {"transfers": transfers, "total": len(transfers)})
                return

            if path == "/api/supplychain/purchasing/requisitions":
                if not self._check_rbac("view_supply_chain"):
                    return
                reqs = [r.__dict__ for r in supply_chain_coordinator.purchasing.requisitions.values()]
                pos = [p.__dict__ for p in supply_chain_coordinator.purchasing.purchase_orders.values()]
                vendors = [v.__dict__ for v in supply_chain_coordinator.purchasing.vendors.values()]
                self._send_json(200, {"requisitions": reqs, "purchase_orders": pos, "vendors": vendors})
                return

            if path == "/api/supplychain/mfg/boms":
                if not self._check_rbac("view_supply_chain"):
                    return
                boms = [supply_chain_coordinator.manufacturing.get_bom_details(b) for b in supply_chain_coordinator.manufacturing.bom_registry]
                orders = [o.__dict__ for o in supply_chain_coordinator.manufacturing.production_orders.values()]
                ecos = [e.__dict__ for e in supply_chain_coordinator.manufacturing.eco_registry.values()]
                self._send_json(200, {"boms": boms, "production_orders": orders, "ecos": ecos})
                return

            if path == "/api/supplychain/mfg/explode":
                if not self._check_rbac("view_supply_chain"):
                    return
                query = urllib.parse.parse_qs(url.query)
                code = query.get("code", ["PREFAB-WALL-STD"])[0]
                qty = int(query.get("qty", ["50"])[0])
                res = supply_chain_coordinator.manufacturing.explode_mrp_requirements(code, qty)
                self._send_json(200, res)
                return

            # =========================================================
            # HUMAN CAPITAL, FLEET & FIELD SERVICE API ROUTES (GET)
            # =========================================================
            if path == "/api/hr/summary":
                if not self._check_rbac("view_hr"):
                    return
                self._send_json(200, hr_mgr.get_hr_summary())
                return

            if path == "/api/hr/employees":
                if not self._check_rbac("view_hr"):
                    return
                emps = [e.__dict__ for e in hr_mgr.employees.values()]
                self._send_json(200, {"employees": emps, "total": len(emps)})
                return

            if path == "/api/recruitment/requisitions":
                if not self._check_rbac("view_hr"):
                    return
                reqs = [r.__dict__ for r in hr_mgr.requisitions.values()]
                cands = [c.__dict__ for c in hr_mgr.candidates.values()]
                self._send_json(200, {"requisitions": reqs, "candidates": cands})
                return

            if path == "/api/fleet/summary":
                if not self._check_rbac("view_fleet"):
                    return
                self._send_json(200, fleet_mgr.get_fleet_summary())
                return

            if path == "/api/fieldservice/summary":
                if not self._check_rbac("view_fieldservice"):
                    return
                self._send_json(200, field_service_mgr.get_field_service_summary())
                return

            if path == "/api/project/schedule":
                if not self._check_rbac("view_schedule"):
                    return
                self._send_json(200, schedule_mgr.get_schedule_summary())
                return

            if path == "/api/quality/summary":
                if not self._check_rbac("view_quality"):
                    return
                self._send_json(200, quality_mgr.get_quality_summary())
                return

            if path == "/api/permits/overview":
                if not self._check_rbac("view_permits"):
                    return
                self._send_json(200, permit_mgr.get_permit_overview())
                return

            # =========================================================
            # YOUTH APPLICANTS, TRANSPARENT ALLOCATIONS & MESSAGING ROUTES
            # =========================================================
            if path == "/api/youth/applicants":
                if not self._check_rbac("view_allocations"):
                    return
                # ISO A.8.12 Data Minimisation & PII Masking
                sanitized_applicants = [
                    {
                        **app,
                        "national_id": mask_national_id(app.get("national_id", "")),
                        "phone": mask_phone_number(app.get("phone", "")),
                        "email": mask_email_address(app.get("email", "")),
                    }
                    for app in youth_applicants_store
                ]
                self._send_json(200, {
                    "total_applicants": len(sanitized_applicants),
                    "applicants": sanitized_applicants,
                    "statutory_quota_mandate_pct": 25.0
                })
                return

            if path == "/api/allocations/register":
                if not self._check_rbac("view_allocations"):
                    return
                sanitized_allocations = [
                    {
                        **alloc,
                        "buyer_phone": mask_phone_number(alloc.get("buyer_phone", ""))
                    }
                    for alloc in allocations_store
                ]
                total_cost = sum(a["total_cost_usd"] for a in allocations_store)
                total_paid = sum(a["paid_to_date_usd"] for a in allocations_store)
                total_balance = sum(a["balance_usd"] for a in allocations_store)
                youth_count = sum(1 for a in allocations_store if a["category"] == "YOUTH_QUOTA")
                self._send_json(200, {
                    "allocations": sanitized_allocations,
                    "metrics": {
                        "total_stands_allocated": len(allocations_store),
                        "total_contract_value_usd": total_cost,
                        "total_collected_usd": total_paid,
                        "total_debtors_balance_usd": total_balance,
                        "youth_allocated_count": youth_count,
                        "youth_quota_percentage": round((youth_count / len(allocations_store)) * 100, 1) if allocations_store else 0.0
                    }
                })
                return

            if path == "/api/messaging/outbox":
                if not self._check_rbac("view_audit_trail"):
                    return
                sanitized_messages = [
                    {
                        **msg,
                        "recipient": mask_phone_number(msg.get("recipient", ""))
                    }
                    for msg in outbound_messages_store
                ]
                self._send_json(200, {
                    "total_messages": len(sanitized_messages),
                    "messages": sanitized_messages
                })
                return

            self._send_json(404, {"error": "API Route Not Found"})
            return

        # =====================================================================
        # STATIC ASSET PROTECTION (ISO A.8.28 & A.8.12)
        # Prevent Source Code, Configuration, and Repository Disclosure
        # =====================================================================
        decoded_path = urllib.parse.unquote(url.path).replace("\\", "/")
        clean_path = os.path.normpath(decoded_path).lstrip("/\\")
        base_dir = os.path.abspath(os.getcwd())
        full_path = os.path.abspath(os.path.join(base_dir, clean_path))

        # Path traversal guard
        if ".." in decoded_path or "/." in decoded_path or not full_path.startswith(base_dir):
            security_guard.log_security_event(
                user_role="anonymous",
                action="PATH_TRAVERSAL_BLOCKED",
                details=f"Forbidden path traversal probe: {url.path}",
                status="BLOCKED"
            )
            self._send_json(403, {"error": "Forbidden", "message": "Access denied.", "security_status": "PATH_TRAVERSAL_BLOCKED"})
            return

        # Default route to index.html
        if clean_path in ("", ".", "index", "index.html"):
            self.path = "/index.html"
            clean_path = "index.html"
            full_path = os.path.join(base_dir, "index.html")

        # Prohibited file extensions & sensitive filenames
        _, ext = os.path.splitext(clean_path.lower())
        filename = os.path.basename(clean_path).lower()
        path_parts = [p.lower() for p in clean_path.replace("\\", "/").split("/") if p]

        prohibited_exts = {
            ".py", ".pyc", ".env", ".ts", ".tsx", ".rs", ".sql", ".sqlite",
            ".db", ".sh", ".cmd", ".bat", ".toml", ".yml", ".yaml", ".lock"
        }
        prohibited_files = {
            "package.json", "package-lock.json", "tsconfig.json", "requirements.txt",
            "cargo.toml", "cargo.lock", "server.py", "main.py", "build_full_frontend.py",
            "build_full_enterprise_erp.py", "generate_erp_platform.py"
        }
        prohibited_dirs = {
            ".git", ".agents", ".gemini", ".refact", "__pycache__", ".pytest_cache",
            "tests", "src", "contracts", "spatial", "config", "tools", "zhms-api", "src-tauri"
        }

        is_prohibited = (
            ext in prohibited_exts or
            filename in prohibited_files or
            any(p.startswith(".") for p in path_parts) or
            any(p in prohibited_dirs for p in path_parts)
        )

        if is_prohibited:
            security_guard.log_security_event(
                user_role="anonymous",
                action="SOURCE_CODE_ACCESS_BLOCKED",
                details=f"Blocked attempt to access protected source/config file: {url.path}",
                status="BLOCKED"
            )
            self._send_json(403, {
                "error": "Forbidden",
                "message": "Direct access to source code, configurations, or repository assets is prohibited (ISO 27001 A.8.28).",
                "security_status": "SOURCE_CODE_ACCESS_BLOCKED"
            })
            return

        if not os.path.exists(full_path) or os.path.isdir(full_path):
            self._send_json(404, {
                "error": "Not Found",
                "message": f"Resource '{url.path}' not found."
            })
            return

        # Otherwise serve allowed public static files safely
        super().do_GET()

    def do_POST(self):
        if not self._check_rate_limit():
            return

        url = urllib.parse.urlparse(self.path)
        path = url.path

        if not path.startswith("/api/"):
            self._send_json(404, {"error": "Not Found"})
            return

        user_role = (self.headers.get("X-User-Role") or "anonymous").strip().lower()
        body = self._parse_post_body()

        # 1. Tenant Screening
        if path == "/api/tenant/screen":
            if not self._check_rbac("screen_tenant"):
                return
            name = security_guard.sanitize(body.get("full_name", ""))
            income = float(body.get("income_usd", 0.0))
            rent = float(body.get("rent_usd", 0.0))
            tenant = lease_mgr.screen_tenant(name, "ID-PENDING", income, rent)
            
            sig = security_guard.sign_transaction({"tenant_id": tenant.tenant_id, "score": tenant.credit_score})
            security_guard.log_security_event(user_role, "SCREEN_TENANT", f"Tenant {name} screened: {tenant.credit_status}")
            
            self._send_json(200, {
                "tenant_id": tenant.tenant_id,
                "full_name": tenant.full_name,
                "credit_score": tenant.credit_score,
                "credit_status": tenant.credit_status,
                "screening_notes": tenant.screening_notes,
                "hmac_signature": sig
            })
            return

        # 2. Certify Payment Application with 10% Retention
        if path == "/api/payment/certify":
            if not self._check_rbac("certify_payment"):
                return
            app_id = security_guard.sanitize(body.get("app_id", "PAY-APP-101"))
            cert_amt = float(body.get("certified_amount", 13500.0))
            variations = float(body.get("variations", 750.0))
            
            try:
                app = job_costing_mgr.certify_payment_application(app_id, cert_amt, variations)
            except ValueError as e:
                self._send_json(404, {"error": str(e)})
                return
            sig = security_guard.sign_transaction({"app_id": app.app_id, "net": app.net_payable_amount_usd})
            security_guard.log_security_event(user_role, "CERTIFY_PAYMENT", f"Certified {app_id} for ${app.net_payable_amount_usd}")

            self._send_json(200, {
                "app_id": app.app_id,
                "certified_amount_usd": app.certified_amount_usd,
                "retention_rate_pct": app.retention_rate_pct,
                "retention_withheld_usd": app.retention_withheld_usd,
                "variation_claims_usd": app.variation_claims_usd,
                "net_payable_amount_usd": app.net_payable_amount_usd,
                "hmac_signature": sig
            })
            return

        # 3. 3-Way Invoice Matching
        if path == "/api/siteops/three-way-match":
            if not self._check_rbac("three_way_match"):
                return
            po_id = security_guard.sanitize(body.get("po_id", "PO-2026-094"))
            receiver = security_guard.sanitize(body.get("receiver_name", "Stores Officer J. Mutasa"))
            invoice_no = security_guard.sanitize(body.get("invoice_no", "INV-PPC-88192"))
            invoiced_amt = float(body.get("invoiced_amount", 5250.0))

            po = site_ops_mgr.procurement_orders.get(po_id)
            if not po:
                po = site_ops_mgr.procurement_orders["PO-2026-094"]

            po.verify_delivery(po.ordered_quantity, receiver)
            result = po.execute_three_way_match(invoice_no, invoiced_amt)
            sig = security_guard.sign_transaction(result)
            security_guard.log_security_event(user_role, "THREE_WAY_MATCH", f"3-Way match executed for {po_id}: {result['three_way_match_passed']}")

            result["hmac_signature"] = sig
            self._send_json(200, result)
            return

        # 4. DLAP Verify Title Deed
        if path == "/api/dlap/verify":
            if not self._check_rbac("dlap_verify"):
                return
            deed_no = security_guard.sanitize(body.get("deed_number", "TD-4982/2021"))
            res = dlap_registry.verify_title_for_transfer(deed_no)
            sig = security_guard.sign_transaction(res)
            res["hmac_signature"] = sig
            self._send_json(200, res)
            return

        # 5. DLAP Register / Clear Caveat
        if path == "/api/dlap/caveat":
            if not self._check_rbac("register_caveat"):
                return
            action = body.get("action", "REGISTER")
            deed_no = security_guard.sanitize(body.get("deed_number", "TD-4982/2021"))
            caveator = security_guard.sanitize(body.get("caveator", "High Court / Lender"))
            cause = security_guard.sanitize(body.get("legal_cause", "Injunction Order"))

            deed = dlap_registry.registry.get(deed_no)
            if deed:
                if action == "CLEAR":
                    cav_ref = body.get("caveat_ref")
                    if cav_ref:
                        deed.clear_caveat(cav_ref)
                    else:
                        deed.caveats_registered.clear()
                        deed.validation_status = "VALIDATED"
                    security_guard.log_security_event(user_role, "CLEAR_CAVEAT", f"Caveat cleared on {deed_no}")
                    self._send_json(200, {
                        "deed_number": deed_no,
                        "validation_status": deed.validation_status,
                        "message": "Electronic caveat cleared. Title clear for transfer."
                    })
                    return
                cav_ref = deed.register_electronic_caveat(caveator, cause)
                security_guard.log_security_event(user_role, "REGISTER_CAVEAT", f"Caveat {cav_ref} placed on {deed_no} by {caveator}")
                self._send_json(200, {
                    "deed_number": deed_no,
                    "caveat_ref": cav_ref,
                    "validation_status": deed.validation_status,
                    "message": "Electronic caveat active. Conveyancing transfer locked."
                })
            else:
                self._send_json(404, {"error": "Deed not found in DLAP"})
            return

        # 6. Materials Dispatch
        if path == "/api/inventory/dispatch":
            if not self._check_rbac("dispatch_material"):
                return
            mat_id = security_guard.sanitize(body.get("material_id", "MAT-CEM-425"))
            qty = float(body.get("quantity", 50.0))
            site = security_guard.sanitize(body.get("site", "SITE-101 (STAND-001)"))
            stage = security_guard.sanitize(body.get("stage", "Stage 1: Substructure"))
            foreman = security_guard.sanitize(body.get("foreman", "Tapiwa Zhou"))

            try:
                rec = inventory_mgr.dispatch_to_site(mat_id, qty, site, stage, "Authorized", foreman)
                sig = security_guard.sign_transaction(rec)
                rec["hmac_signature"] = sig
                security_guard.log_security_event(user_role, "DISPATCH_MATERIAL", f"Dispatched {qty} of {mat_id} to {site}")
                self._send_json(200, rec)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 7. Stand Sale & Statutory Agreement of Sale
        if path == "/api/stands/sell":
            if not self._check_rbac("sell_stand"):
                return
            stand_id = security_guard.sanitize(body.get("stand_id", "STAND-003"))
            buyer = security_guard.sanitize(body.get("buyer_name", "Blessing Hove"))
            buyer_id = security_guard.sanitize(body.get("buyer_id", "63-948192-K-19"))
            deposit = float(body.get("deposit_usd", 1500.0))

            contract_data = land_sales_mgr.generate_agreement_of_sale(
                stand_id=stand_id,
                area_sqm=3000.0,
                zoning="HIGH_RISE",
                buyer_name=buyer,
                buyer_id=buyer_id,
                buyer_address="Harare, Zimbabwe",
                buyer_phone="+263 770 000000",
                purchase_price_usd=7500.0,
                deposit_paid_usd=deposit,
                payment_terms="24 Months Amortized"
            )
            sig = security_guard.sign_transaction({"stand": stand_id, "buyer": buyer, "deposit": deposit})
            security_guard.log_security_event(user_role, "SELL_STAND", f"Sold {stand_id} to {buyer} for deposit ${deposit}")

            self._send_json(200, {
                "stand_id": stand_id,
                "buyer_name": buyer,
                "deposit_usd": deposit,
                "contract_data": contract_data,
                "hmac_signature": sig
            })
            return

        # 8. POS / EcoCash Payment
        if path == "/api/pos/pay":
            if not self._check_rbac("process_pos_receipt"):
                return
            stand = security_guard.sanitize(body.get("stand", "STAND-001"))
            usd = float(body.get("amount_usd", 500.0))
            method = security_guard.sanitize(body.get("method", "EcoCash"))

            rec_no = f"REC-2026-{int(round(usd)) + 100}"
            sig = security_guard.sign_transaction({"rec": rec_no, "stand": stand, "usd": usd})
            security_guard.log_security_event(user_role, "PROCESS_PAYMENT", f"Receipt {rec_no}: ${usd} USD via {method}")

            self._send_json(200, {
                "receipt_number": rec_no,
                "stand": stand,
                "amount_usd": usd,
                "amount_zwg": round(usd * 26.50, 2),
                "method": method,
                "hmac_signature": sig,
                "status": "SETTLED"
            })
            return

        # 9. Offline Queue Sync
        if path == "/api/offline/sync":
            if not self._check_rbac("sync_offline"):
                return
            res = lean_engine.process_sync_queue()
            security_guard.log_security_event(user_role, "SYNC_OFFLINE_QUEUE", f"Reconciled {res['synced_count']} events")
            self._send_json(200, res)
            return

        # 10. Log Real Estate Inquiry
        if path == "/api/crm/inquiries":
            if not self._check_rbac("manage_inquiries"):
                return
            cust_name = security_guard.sanitize(body.get("customer_name", "Inquiry Client"))
            phone = security_guard.sanitize(body.get("phone", "+263 770 000000"))
            email = security_guard.sanitize(body.get("email", "client@example.com"))
            channel = security_guard.sanitize(body.get("source_channel", "WHATSAPP_BOT"))
            interest = security_guard.sanitize(body.get("property_interest", "Residential Stand"))
            budget = float(body.get("budget_usd", 25000.0))
            notes = security_guard.sanitize(body.get("notes", "New Digital Lead"))
            agent = security_guard.sanitize(body.get("assigned_agent", "Tapiwa Zhou"))
            urgency = security_guard.sanitize(body.get("urgency", "Medium"))
            is_diaspora = bool(body.get("is_diaspora", False))
            diaspora_ctry = security_guard.sanitize(body.get("diaspora_country", "")) if is_diaspora else None

            inq = crm_mgr.create_inquiry(
                customer_name=cust_name,
                phone=phone,
                email=email,
                source_channel=channel,
                property_interest=interest,
                budget_usd=budget,
                notes=notes,
                assigned_agent=agent,
                urgency=urgency,
                is_diaspora=is_diaspora,
                diaspora_country=diaspora_ctry
            )
            sig = security_guard.sign_transaction(inq.to_dict())
            security_guard.log_security_event(user_role, "CREATE_INQUIRY", f"Inquiry {inq.inquiry_id} created for {cust_name} via {channel}")

            resp_data = inq.to_dict()
            resp_data["hmac_signature"] = sig
            self._send_json(200, resp_data)
            return

        # 11. Create Sales Deal
        if path == "/api/crm/deals/create":
            if not self._check_rbac("manage_pipeline"):
                return
            title = security_guard.sanitize(body.get("title", "Property Acquisition Deal"))
            cust_name = security_guard.sanitize(body.get("customer_name", "Prospective Buyer"))
            stand_id = security_guard.sanitize(body.get("stand_or_property_id", "STAND-001"))
            val_usd = float(body.get("deal_value_usd", 30000.0))
            terms = security_guard.sanitize(body.get("payment_terms", "12 Months Amortized"))
            agent = security_guard.sanitize(body.get("assigned_agent", "Tapiwa Zhou"))
            stage = security_guard.sanitize(body.get("initial_stage", "1_INQUIRY_CAPTURED"))
            inq_id = security_guard.sanitize(body.get("linked_inquiry_id", "")) or None

            deal = crm_mgr.create_deal(
                title=title,
                customer_name=cust_name,
                stand_or_property_id=stand_id,
                deal_value_usd=val_usd,
                payment_terms=terms,
                assigned_agent=agent,
                initial_stage=stage,
                linked_inquiry_id=inq_id
            )
            sig = security_guard.sign_transaction(deal.to_dict())
            security_guard.log_security_event(user_role, "CREATE_DEAL", f"Deal {deal.deal_id} created for {cust_name}: ${val_usd}")

            resp_data = deal.to_dict()
            resp_data["hmac_signature"] = sig
            self._send_json(200, resp_data)
            return

        # 12. Advance Sales Pipeline Deal Stage
        if path == "/api/crm/deals/stage":
            if not self._check_rbac("manage_pipeline"):
                return
            deal_id = security_guard.sanitize(body.get("deal_id", "DEAL-1001"))
            new_stage = security_guard.sanitize(body.get("new_stage", "2_CONTACT_QUALIFIED"))
            notes = security_guard.sanitize(body.get("notes", ""))
            reason = security_guard.sanitize(body.get("closed_reason", "")) or None

            try:
                deal = crm_mgr.advance_deal_stage(deal_id, new_stage, notes=notes, closed_reason=reason)
                sig = security_guard.sign_transaction(deal.to_dict())
                security_guard.log_security_event(user_role, "ADVANCE_STAGE", f"Deal {deal_id} transitioned to {new_stage}")

                resp_data = deal.to_dict()
                resp_data["hmac_signature"] = sig
                self._send_json(200, resp_data)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 13. Log Client Communication
        if path == "/api/crm/communications":
            if not self._check_rbac("log_communication"):
                return
            cust = security_guard.sanitize(body.get("customer_id_or_name", "Client"))
            ref = security_guard.sanitize(body.get("inquiry_or_deal_ref", "GENERAL"))
            channel = security_guard.sanitize(body.get("channel", "WHATSAPP"))
            direction = security_guard.sanitize(body.get("direction", "INBOUND"))
            agent = security_guard.sanitize(body.get("agent_name", "Tapiwa Zhou"))
            summary = security_guard.sanitize(body.get("summary", "Client inquiry message"))
            sentiment = security_guard.sanitize(body.get("client_sentiment", "Positive"))
            action = security_guard.sanitize(body.get("follow_up_action", "")) or None
            f_date = security_guard.sanitize(body.get("follow_up_date", "")) or None

            comm = crm_mgr.log_communication(
                customer_id_or_name=cust,
                inquiry_or_deal_ref=ref,
                channel=channel,
                direction=direction,
                agent_name=agent,
                summary=summary,
                client_sentiment=sentiment,
                follow_up_action=action,
                follow_up_date=f_date
            )
            sig = security_guard.sign_transaction(comm.to_dict())
            security_guard.log_security_event(user_role, "LOG_COMMUNICATION", f"Logged {channel} interaction for {cust}")

            resp_data = comm.to_dict()
            resp_data["hmac_signature"] = sig
            self._send_json(200, resp_data)
            return

        # 14. Create or Update Customer 360 Profile
        if path == "/api/crm/customer":
            if not self._check_rbac("manage_customers"):
                return
            full_name = security_guard.sanitize(body.get("full_name", "New Customer"))
            nat_id = security_guard.sanitize(body.get("national_id_or_passport", "ID-PENDING"))
            phone = security_guard.sanitize(body.get("phone", "+263 770 000000"))
            email = security_guard.sanitize(body.get("email", "client@example.com"))
            cat = security_guard.sanitize(body.get("category", "LOCAL_FIRST_TIME"))
            is_diasp = bool(body.get("is_diaspora", False))
            diasp_ctry = security_guard.sanitize(body.get("diaspora_country", "")) if is_diasp else None
            tags = body.get("tags", [])

            cust = crm_mgr.create_or_update_customer(
                full_name=full_name,
                national_id_or_passport=nat_id,
                phone=phone,
                email=email,
                category=cat,
                is_diaspora=is_diasp,
                diaspora_country=diasp_ctry,
                tags=tags
            )
            sig = security_guard.sign_transaction(cust.to_dict())
            security_guard.log_security_event(user_role, "MANAGE_CUSTOMER", f"Customer profile updated for {full_name}")

            resp_data = cust.to_dict()
            resp_data["hmac_signature"] = sig
            self._send_json(200, resp_data)
            return

        # =========================================================
        # 15. Supply Chain: WMS Stock Transfer
        # =========================================================
        if path == "/api/supplychain/wms/transfer":
            if not self._check_rbac("manage_wms"):
                return
            src = security_guard.sanitize(body.get("source_location", "WH-CENTRAL-HAR"))
            dst = security_guard.sanitize(body.get("dest_location", "SITE-HIGHLANDS-01"))
            item_id = security_guard.sanitize(body.get("item_id", "MAT-BRICK"))
            qty = float(body.get("quantity", 5000.0))
            req_by = security_guard.sanitize(body.get("requested_by", "Foreman Garikai Sithole"))
            auth_by = security_guard.sanitize(body.get("authorized_by", "Eng. Tendai Chiweshe"))
            disp_by = security_guard.sanitize(body.get("dispatched_by", "Stores Clerk Moyo"))

            res = supply_chain_coordinator.wms.transfer_material(src, dst, item_id, qty, req_by, auth_by, disp_by)
            if res.get("success"):
                sig = security_guard.sign_transaction({"trf": res["transfer_id"], "qty": qty, "src": src, "dst": dst})
                res["hmac_signature"] = sig
                security_guard.log_security_event(user_role, "WMS_TRANSFER", f"Transferred {qty} of {item_id} from {src} to {dst}")
                self._send_json(200, res)
            else:
                self._send_json(400, res)
            return

        # 16. Supply Chain: Confirm Transfer Receipt
        if path == "/api/supplychain/wms/transfer/confirm":
            if not self._check_rbac("manage_wms"):
                return
            trf_id = security_guard.sanitize(body.get("transfer_id", ""))
            recv_by = security_guard.sanitize(body.get("received_by", "Site Receiver"))
            res = supply_chain_coordinator.wms.confirm_transfer_receipt(trf_id, recv_by)
            if res.get("success"):
                security_guard.log_security_event(user_role, "WMS_CONFIRM_RECEIPT", f"Confirmed receipt of {trf_id} by {recv_by}")
                self._send_json(200, res)
            else:
                self._send_json(400, res)
            return

        # 17. Supply Chain: Create Material Requisition & Evaluate Quotes
        if path == "/api/supplychain/purchasing/requisition":
            if not self._check_rbac("manage_purchasing"):
                return
            site = security_guard.sanitize(body.get("project_site", "SITE-HIGHLANDS-01"))
            req_by = security_guard.sanitize(body.get("requested_by", "Eng. Chiweshe"))
            req_date = security_guard.sanitize(body.get("required_date", "2026-10-20"))
            items = body.get("items", [{"item_id": "MAT-CEMENT-32", "item_name": "Cement", "qty": 500, "unit": "bags"}])
            urgency = security_guard.sanitize(body.get("urgency", "NORMAL"))

            res = supply_chain_coordinator.purchasing.create_requisition(site, req_by, req_date, items, urgency)
            sig = security_guard.sign_transaction({"req_id": res["requisition_id"], "site": site})
            res["hmac_signature"] = sig
            security_guard.log_security_event(user_role, "CREATE_PURCHASE_REQUISITION", f"Created {res['requisition_id']} for {site}")
            self._send_json(200, {"success": True, "requisition_id": res["requisition_id"]})
            return

        # 18. Supply Chain: Automated Replenishment & 3-Way Match
        if path == "/api/supplychain/purchasing/replenish":
            if not self._check_rbac("manage_purchasing"):
                return
            item_id = security_guard.sanitize(body.get("item_id", "MAT-CEMENT-32"))
            qty = float(body.get("quantity", 300.0))
            site = security_guard.sanitize(body.get("target_site", "WH-CENTRAL-HAR"))

            res = supply_chain_coordinator.execute_automated_replenishment(item_id, qty, site)
            if res.get("success"):
                sig = security_guard.sign_transaction({"po": res["po_id"], "grn": res["grn_reference"], "item": item_id})
                res["hmac_signature"] = sig
                security_guard.log_security_event(user_role, "SUPPLY_CHAIN_REPLENISH", f"Replenished {qty} of {item_id} at {site} with 3-Way Match")
                self._send_json(200, res)
            else:
                self._send_json(400, res)
            return

        # 19. Supply Chain: 3-Way Invoice Match
        if path == "/api/supplychain/purchasing/match":
            if not self._check_rbac("three_way_match"):
                return
            po_id = security_guard.sanitize(body.get("po_id", "PO-2026-104"))
            inv_no = security_guard.sanitize(body.get("invoice_number", "INV-PPC-2610"))
            inv_date = security_guard.sanitize(body.get("invoice_date", "2026-10-09"))
            amt = float(body.get("billed_amount_usd", 8400.0))

            res = supply_chain_coordinator.purchasing.perform_three_way_match(po_id, inv_no, inv_date, amt)
            if res.get("success"):
                sig = security_guard.sign_transaction({"match": res["three_way_match"], "po": po_id, "inv": inv_no})
                res["hmac_signature"] = sig
                security_guard.log_security_event(user_role, "THREE_WAY_MATCH", f"3-Way Match for {po_id} / {inv_no}: {res['three_way_match']}")
                self._send_json(200, res)
            else:
                self._send_json(400, res)
            return

        # 20. Supply Chain: Assemble Finished Prefabricated Component (MRP to WMS)
        if path == "/api/supplychain/mfg/assemble":
            if not self._check_rbac("manage_mrp"):
                return
            prod_code = security_guard.sanitize(body.get("product_code", "PREFAB-WALL-STD"))
            qty = int(body.get("quantity", 10))
            dest_site = security_guard.sanitize(body.get("destination_site", "SITE-HIGHLANDS-01"))

            res = supply_chain_coordinator.assemble_and_stock_prefab(prod_code, qty, dest_site)
            if res.get("success"):
                sig = security_guard.sign_transaction({"pwo": res["work_order_id"], "code": prod_code, "qty": qty})
                res["hmac_signature"] = sig
                security_guard.log_security_event(user_role, "MRP_ASSEMBLE_PREFAB", f"Manufactured {qty} of {prod_code} for {dest_site}")
                self._send_json(200, res)
            else:
                self._send_json(400, res)
            return

        # 21. Supply Chain: Submit Engineering Change Order (PLM)
        if path == "/api/supplychain/mfg/eco":
            if not self._check_rbac("manage_mrp"):
                return
            prod_code = security_guard.sanitize(body.get("product_code", "PREFAB-WALL-STD"))
            title = security_guard.sanitize(body.get("title", "Eco-friendly material update"))
            just = security_guard.sanitize(body.get("justification", "ZNCC standard compliance"))
            old_rev = security_guard.sanitize(body.get("old_revision", "Rev A"))
            new_rev = security_guard.sanitize(body.get("new_revision", "Rev B"))
            req_by = security_guard.sanitize(body.get("requested_by", "Eng. Blessing Musona"))

            res = supply_chain_coordinator.manufacturing.submit_engineering_change_order(prod_code, title, just, old_rev, new_rev, req_by)
            self._send_json(200, res)
            return

        # =========================================================
        # 22. HR: Onboard Employee Lifecycle
        # =========================================================
        if path == "/api/hr/employee/onboard":
            if not self._check_rbac("manage_employees"):
                return
            name = security_guard.sanitize(body.get("full_name", "Artisan Worker"))
            nat_id = security_guard.sanitize(body.get("national_id", "63-000000-X-00"))
            title = security_guard.sanitize(body.get("job_title", "Site Artisan"))
            dept = security_guard.sanitize(body.get("department", "Civil & Building"))
            grade = security_guard.sanitize(body.get("nec_grade", "Grade 7: Class 1 Artisan (Journeyman Builder/Plant Operator)"))
            contract = security_guard.sanitize(body.get("contract_type", "NEC Construction Site Artisan"))
            salary = float(body.get("base_salary_usd", 1500.0))
            site = security_guard.sanitize(body.get("site_assigned", "Parkview Heights High-Rise"))

            emp = hr_mgr.onboard_employee(
                full_name=name,
                national_id=nat_id,
                job_title=title,
                department=dept,
                nec_grade=grade,
                contract_type=contract,
                base_salary_usd=salary,
                site_assigned=site
            )
            sig = security_guard.sign_transaction({"emp_id": emp.employee_id, "name": emp.full_name, "salary": emp.base_salary_usd})
            security_guard.log_security_event(user_role, "ONBOARD_EMPLOYEE", f"Onboarded {name} as {title} ({emp.employee_id})")
            resp = emp.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 23. HR: Site Attendance Muster Roll Logging
        if path == "/api/hr/attendance/log":
            if not self._check_rbac("log_attendance"):
                return
            emp_id = security_guard.sanitize(body.get("employee_id", "EMP-2026-001"))
            site_id = security_guard.sanitize(body.get("site_id", "SITE-001"))
            site_name = security_guard.sanitize(body.get("site_name", "Parkview Heights High-Rise"))
            clock_in = security_guard.sanitize(body.get("clock_in_time", "07:00"))
            clock_out = security_guard.sanitize(body.get("clock_out_time", "17:00"))
            reg_hrs = float(body.get("regular_hours", 8.0))
            ot_1_5x = float(body.get("overtime_1_5x_hours", 0.0))
            ot_2_0x = float(body.get("overtime_2_0x_hours", 0.0))
            gps = security_guard.sanitize(body.get("gps_coordinates", "-17.8292, 31.0522"))

            rec = hr_mgr.log_site_attendance(
                employee_id=emp_id,
                site_id=site_id,
                site_name=site_name,
                clock_in=clock_in,
                clock_out=clock_out,
                regular_hours=reg_hrs,
                ot_1_5x=ot_1_5x,
                ot_2_0x=ot_2_0x,
                gps_coords=gps
            )
            sig = security_guard.sign_transaction({"rec_id": rec.record_id, "emp": emp_id, "hrs": rec.total_hours_worked})
            security_guard.log_security_event(user_role, "LOG_ATTENDANCE", f"Muster roll logged for {emp_id} at {site_name}")
            resp = rec.__dict__.copy()
            resp["total_hours_worked"] = rec.total_hours_worked
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 24. HR: Process Localized Zimbabwean Payroll
        if path == "/api/hr/payroll/process":
            if not self._check_rbac("process_payroll"):
                return
            period = security_guard.sanitize(body.get("period", "2026-10"))
            batch_result = hr_mgr.run_company_payroll_batch(period=period)
            sig = security_guard.sign_transaction({
                "period": period,
                "gross": batch_result["total_gross_payroll_usd"],
                "net": batch_result["total_net_payable_usd"]
            })
            security_guard.log_security_event(user_role, "PROCESS_PAYROLL", f"Payroll batch processed for {period}: ${batch_result['total_net_payable_usd']} net payable")
            batch_result["hmac_signature"] = sig
            self._send_json(200, batch_result)
            return

        # 25. HR: Recruitment Candidate Application
        if path == "/api/recruitment/apply":
            req_id = security_guard.sanitize(body.get("req_id", "REQ-2026-01"))
            name = security_guard.sanitize(body.get("full_name", "Applicant"))
            nat_id = security_guard.sanitize(body.get("national_id", "63-123456-A-00"))
            qual = security_guard.sanitize(body.get("trade_qualification", "Class 1 Artisan"))
            exp = float(body.get("experience_years", 5.0))
            phone = security_guard.sanitize(body.get("phone", "+263 770 000000"))
            email = security_guard.sanitize(body.get("email", "candidate@zimbuild.co.zw"))

            cand = hr_mgr.apply_candidate(req_id, name, nat_id, qual, exp, phone, email)
            sig = security_guard.sign_transaction({"candidate_id": cand.candidate_id, "req_id": req_id})
            resp = cand.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # =========================================================
        # 26. Fleet: Shift Telematics Logging
        # =========================================================
        if path == "/api/fleet/shift/log":
            if not self._check_rbac("log_fleet_shift"):
                return
            asset_id = security_guard.sanitize(body.get("asset_id", "EQ-CAT-320D"))
            operator = security_guard.sanitize(body.get("operator_name", "Farai Shumba"))
            site = security_guard.sanitize(body.get("site_location", "Parkview Heights"))
            eng_hrs = float(body.get("engine_hours", 7.5))
            idle_hrs = float(body.get("idle_hours", 1.0))
            bd_hrs = float(body.get("breakdown_hours", 0.0))
            cost_code = security_guard.sanitize(body.get("project_cost_code", "JOB-CIV-FOUND-01"))

            log = fleet_mgr.log_shift_telematics(
                asset_id=asset_id,
                operator_name=operator,
                site_location=site,
                engine_hours=eng_hrs,
                idle_hours=idle_hrs,
                breakdown_hours=bd_hrs,
                project_cost_code=cost_code
            )
            sig = security_guard.sign_transaction({"log_id": log.log_id, "asset": asset_id, "recovered": log.total_cost_recovered_usd})
            security_guard.log_security_event(user_role, "LOG_FLEET_SHIFT", f"Telematics logged for {asset_id}: {eng_hrs}h run, ${log.total_cost_recovered_usd} recovered")
            resp = log.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 27. Fleet: Fuel Dispensing & Anomaly Detection
        if path == "/api/fleet/fuel/log":
            if not self._check_rbac("log_fuel"):
                return
            asset_id = security_guard.sanitize(body.get("asset_id", "EQ-CAT-320D"))
            ftype = security_guard.sanitize(body.get("fuel_type", "Diesel 50ppm"))
            liters = float(body.get("liters", 100.0))
            price = float(body.get("unit_price_usd", 1.62))
            bowser = security_guard.sanitize(body.get("bowser_or_station", "On-Site Bowser #01"))
            meter = float(body.get("meter_reading", 4120.0))
            delta = float(body.get("hours_or_km_delta", 6.0))

            rec = fleet_mgr.record_fuel_dispense(
                asset_id=asset_id,
                fuel_type=ftype,
                liters=liters,
                unit_price_usd=price,
                bowser_or_station=bowser,
                meter_reading=meter,
                hours_or_km_delta=delta
            )
            sig = security_guard.sign_transaction({"voucher": rec.voucher_id, "asset": asset_id, "cost": rec.total_cost_usd})
            security_guard.log_security_event(user_role, "LOG_FUEL_DISPENSE", f"Fuel dispensed: {liters}L to {asset_id} (Anomaly: {rec.is_anomaly_flagged})")
            resp = rec.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 28. Fleet: Equipment Appraisal & IAS 16 Revaluation
        if path == "/api/fleet/appraisal":
            if not self._check_rbac("appraise_equipment"):
                return
            asset_id = security_guard.sanitize(body.get("asset_id", "EQ-CAT-320D"))
            appraiser = security_guard.sanitize(body.get("certified_appraiser", "Eng. K. Marufu (Chartered Plant Valuer)"))
            grade = security_guard.sanitize(body.get("condition_grade", "Grade B: Good / Minor Wear"))
            eng_h = float(body.get("engine_health_pct", 88.0))
            hyd_h = float(body.get("hydraulics_health_pct", 85.0))
            und_h = float(body.get("undercarriage_tires_pct", 80.0))
            cha_h = float(body.get("chassis_structural_pct", 90.0))
            elec_h = float(body.get("electrical_system_pct", 85.0))
            fmv = float(body.get("appraised_fair_market_value_usd", 145000.0))
            rcn = float(body.get("replacement_cost_new_usd", 215000.0))
            notes = security_guard.sanitize(body.get("notes", "Routine annual condition survey"))

            app = fleet_mgr.appraise_equipment(
                asset_id=asset_id,
                certified_appraiser=appraiser,
                condition_grade=grade,
                engine_health_pct=eng_h,
                hydraulics_health_pct=hyd_h,
                undercarriage_tires_pct=und_h,
                chassis_structural_pct=cha_h,
                electrical_system_pct=elec_h,
                appraised_fmv_usd=fmv,
                replacement_cost_new_usd=rcn,
                notes=notes
            )
            security_guard.log_security_event(user_role, "APPRAISE_EQUIPMENT", f"Appraised {asset_id} at ${fmv} FMV (Delta: ${app.revaluation_surplus_or_deficit_usd})")
            resp = app.__dict__.copy()
            self._send_json(200, resp)
            return

        # =========================================================
        # 29. Field Service: Dispatch Work Order
        # =========================================================
        if path == "/api/fieldservice/dispatch":
            if not self._check_rbac("dispatch_work_order"):
                return
            req_id = security_guard.sanitize(body.get("request_id", "SR-2026-002"))
            tech_id = security_guard.sanitize(body.get("tech_id", "TECH-002"))
            scope = security_guard.sanitize(body.get("scope_of_work", "Emergency on-site hydraulic hose replacement"))
            rate = float(body.get("hourly_labor_rate_usd", 40.0))

            wo = field_service_mgr.dispatch_work_order(req_id, tech_id, scope, rate)
            sig = security_guard.sign_transaction({"wo_id": wo.wo_id, "tech": tech_id, "req": req_id})
            security_guard.log_security_event(user_role, "DISPATCH_FIELD_SERVICE", f"Dispatched {wo.wo_id} to {tech_id}")
            resp = wo.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 30. Field Service: Mobile Field Logging (GPS Check-in & Photo Evidence)
        if path == "/api/fieldservice/mobile/log":
            if not self._check_rbac("mobile_log_service"):
                return
            wo_id = security_guard.sanitize(body.get("wo_id", "FWO-2026-001"))
            tech_id = security_guard.sanitize(body.get("tech_id", "TECH-001"))
            action = security_guard.sanitize(body.get("action_type", "GPS_CHECKIN"))
            gps = security_guard.sanitize(body.get("gps_lat_lng", "-17.8292, 31.0522"))
            photo = body.get("photo_data", "site_repair_photo_bytes")
            notes = security_guard.sanitize(body.get("notes", "On-site field inspection complete"))

            log = field_service_mgr.record_mobile_field_log(
                wo_id=wo_id,
                tech_id=tech_id,
                action_type=action,
                gps_lat_lng=gps,
                photo_bytes_or_string=photo,
                notes=notes
            )
            sig = security_guard.sign_transaction({"log_id": log.log_id, "wo_id": wo_id, "gps": gps})
            security_guard.log_security_event(user_role, "MOBILE_FIELD_LOG", f"Field log {log.log_id} recorded for {wo_id} by {tech_id}")
            resp = log.__dict__.copy()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 31. Field Service: Complete Work Order & Client Sign-off
        if path == "/api/fieldservice/workorder/complete":
            if not self._check_rbac("complete_work_order"):
                return
            wo_id = security_guard.sanitize(body.get("wo_id", "FWO-2026-001"))
            hrs = float(body.get("labor_hours", 3.0))
            notes = security_guard.sanitize(body.get("work_notes", "Replaced parts, tested line voltage, customer verified operation."))
            client = security_guard.sanitize(body.get("client_name", "Tendai Moyo"))

            wo = field_service_mgr.complete_work_order(wo_id, hrs, notes, client)
            security_guard.log_security_event(user_role, "COMPLETE_WORK_ORDER", f"Work order {wo_id} completed, certified by {client}")
            resp = wo.__dict__.copy()
            self._send_json(200, resp)
            return

        # =========================================================
        # 32. Project Engineering: Update Schedule Task
        # =========================================================
        if path == "/api/project/task/update":
            if not self._check_rbac("update_task"):
                return
            t_id = security_guard.sanitize(body.get("task_id", "TSK-08"))
            prog = int(body.get("progress_pct", 50))
            stat = security_guard.sanitize(body.get("status", "")) or None
            try:
                task = schedule_mgr.update_task_progress(t_id, prog, stat)
                sig = security_guard.sign_transaction(task.to_dict())
                security_guard.log_security_event(user_role, "UPDATE_TASK", f"Task {t_id} updated to {prog}%")
                resp = task.to_dict()
                resp["hmac_signature"] = sig
                self._send_json(200, resp)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 33. Quality: Record Concrete Cube Crush Test
        if path == "/api/quality/cube-test":
            if not self._check_rbac("log_cube_test"):
                return
            loc = security_guard.sanitize(body.get("pour_location", "First Floor Columns"))
            elem = security_guard.sanitize(body.get("structural_element", "Column"))
            mix = security_guard.sanitize(body.get("mix_designation", "C30"))
            slump = int(body.get("slump_mm", 90))
            s7 = float(body.get("strength_7day_mpa", 22.0))
            s28 = float(body.get("strength_28day_mpa", 33.5))
            tester = security_guard.sanitize(body.get("tested_by", "SAZ Materials Testing"))

            cube = quality_mgr.record_cube_test(loc, elem, mix, slump, s7, s28, tester)
            sig = security_guard.sign_transaction(cube.to_dict())
            security_guard.log_security_event(user_role, "LOG_CUBE_TEST", f"Cube test {cube.test_id} logged: {s28} MPa ({'PASSED' if cube.passed else 'FAILED'})")
            resp = cube.to_dict()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 34. Quality: Log Construction Snag
        if path == "/api/quality/snag/log":
            if not self._check_rbac("manage_snags"):
                return
            loc = security_guard.sanitize(body.get("location", "Stand 001 Bedroom 2"))
            trade = security_guard.sanitize(body.get("trade", "Carpentry"))
            desc = security_guard.sanitize(body.get("description", "Door hinge loose"))
            sev = security_guard.sanitize(body.get("severity", "MINOR"))
            photo = security_guard.sanitize(body.get("photo_hash", "hash_snag_photo"))
            sub = security_guard.sanitize(body.get("assigned_subcontractor", "Apex Joinery"))

            snag = quality_mgr.log_snag(loc, trade, desc, sev, photo, sub)
            sig = security_guard.sign_transaction(snag.to_dict())
            security_guard.log_security_event(user_role, "LOG_SNAG", f"Snag {snag.snag_id} logged for {loc}")
            resp = snag.to_dict()
            resp["hmac_signature"] = sig
            self._send_json(200, resp)
            return

        # 35. Quality: Resolve Construction Snag
        if path == "/api/quality/snag/resolve":
            if not self._check_rbac("manage_snags"):
                return
            snag_id = security_guard.sanitize(body.get("snag_id", ""))
            try:
                snag = quality_mgr.resolve_snag(snag_id)
                security_guard.log_security_event(user_role, "RESOLVE_SNAG", f"Snag {snag_id} resolved")
                self._send_json(200, snag.to_dict())
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # 36. Mortgage: Dual-Currency Installment Calculation
        if path == "/api/mortgage/calculate":
            if not self._check_rbac("calculate_mortgage"):
                return
            price = float(body.get("property_price_usd", 45000.0))
            dep_pct = float(body.get("deposit_pct", 20.0))
            years = int(body.get("loan_term_years", 5))
            rate = float(body.get("annual_interest_rate_pct", 12.0))

            calc = mortgage_engine.calculate_mortgage(price, dep_pct, years, rate)
            sig = security_guard.sign_transaction({"price": price, "monthly_usd": calc["monthly_installment_usd"]})
            calc["hmac_signature"] = sig
            self._send_json(200, calc)
            return

        # 37. Municipal Permits: Signoff Inspection Stage
        if path == "/api/permits/signoff":
            if not self._check_rbac("signoff_permit"):
                return
            stage_id = int(body.get("stage_id", 5))
            inspector = security_guard.sanitize(body.get("inspector_name", "City Building Inspector Moyo"))
            cert_hash = security_guard.sanitize(body.get("certificate_hash", "hash_cert_auto"))

            try:
                stg = permit_mgr.signoff_stage(stage_id, inspector, cert_hash)
                sig = security_guard.sign_transaction(stg.to_dict())
                security_guard.log_security_event(user_role, "SIGNOFF_PERMIT", f"Statutory stage {stage_id} signed off by {inspector}")
                resp = stg.to_dict()
                resp["hmac_signature"] = sig
                self._send_json(200, resp)
            except ValueError as e:
                self._send_json(400, {"error": str(e)})
            return

        # =========================================================
        # 38. Youth Mobile Registration Endpoint
        # =========================================================
        if path == "/api/youth/register":
            if not self._check_rbac("youth_register"):
                return
            name = security_guard.sanitize(body.get("full_name", ""))
            nat_id = security_guard.sanitize(body.get("national_id", ""))
            dob = security_guard.sanitize(body.get("dob", ""))
            phone = security_guard.sanitize(body.get("phone", ""))
            email = security_guard.sanitize(body.get("email", ""))
            scheme = security_guard.sanitize(body.get("scheme_preference", "KADOMA_YOUTH_SCHEME"))
            stand_pref = security_guard.sanitize(body.get("preferred_stand", "STAND-104"))
            income = float(body.get("annual_income_usd", 6000.0))

            # Statutory Youth Quota Calculation (<= 35 years old)
            try:
                birth_year = int(dob.split("-")[0])
                current_year = datetime.now().year
                age = current_year - birth_year
            except Exception:
                age = int(body.get("age", 25))

            if age > 35:
                self._send_json(400, {
                    "error": f"Statutory Youth Quota Restriction: Age {age} exceeds statutory youth limit (<=35 years)."
                })
                return

            app_id = f"YOUTH-APP-2026-{len(youth_applicants_store) + 1:03d}"
            new_applicant = {
                "applicant_id": app_id,
                "full_name": name,
                "national_id": nat_id,
                "dob": dob,
                "age": age,
                "phone": phone,
                "email": email,
                "scheme_preference": scheme,
                "preferred_stand": stand_pref,
                "annual_income_usd": income,
                "quota_verified": True,
                "registered_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "status": "APPROVED_STAND_RESERVED"
            }
            youth_applicants_store.append(new_applicant)

            # Automatically queue welcoming / onboarding SMS/WhatsApp statement
            msg_id = f"MSG-2026-{len(outbound_messages_store) + 101:03d}"
            welcome_msg = {
                "message_id": msg_id,
                "recipient": phone,
                "recipient_name": name,
                "type": "WHATSAPP_ONBOARDING",
                "stand_id": stand_pref,
                "text": f"Welcome to Zimbuild Youth Quota Scheme, {name}! Your reservation for {stand_pref} ({scheme}) is confirmed. App ID: {app_id}.",
                "status": "DELIVERED",
                "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            outbound_messages_store.append(welcome_msg)

            sig = security_guard.sign_transaction(new_applicant)
            security_guard.log_security_event(user_role, "YOUTH_REGISTRATION", f"Youth applicant {name} registered for {stand_pref} (Age {age})")

            resp_data = new_applicant.copy()
            resp_data["hmac_signature"] = sig
            resp_data["auto_dispatched_message"] = welcome_msg
            self._send_json(200, resp_data)
            return

        # =========================================================
        # 39. Automated SMS / WhatsApp Payment Reminder Dispatcher
        # =========================================================
        if path == "/api/messaging/send-reminder":
            if not self._check_rbac("send_reminder"):
                return
            alloc_id = security_guard.sanitize(body.get("allocation_id", ""))
            channel = security_guard.sanitize(body.get("channel", "WHATSAPP")) # WHATSAPP or SMS
            msg_type = security_guard.sanitize(body.get("type", "PAYMENT_REMINDER")) # PAYMENT_REMINDER or STATEMENT

            alloc = next((a for a in allocations_store if a["allocation_id"] == alloc_id), None)
            if not alloc:
                self._send_json(404, {"error": f"Allocation {alloc_id} not found."})
                return

            if msg_type == "STATEMENT":
                text = f"Zimbuild Statement for {alloc['buyer_name']} ({alloc['stand_id']}): Contract ${alloc['total_cost_usd']:,.2f} USD | Paid ${alloc['paid_to_date_usd']:,.2f} USD | Balance ${alloc['balance_usd']:,.2f} USD. Thank you."
            else:
                text = f"Reminder: Your monthly installment of ${alloc['next_amount_usd']:,.2f} USD for {alloc['stand_id']} is due on {alloc['next_due_date']}. Dial *151# for EcoCash or swipe at Zimbuild cashier."

            new_msg = {
                "message_id": f"MSG-2026-{len(outbound_messages_store) + 101:03d}",
                "recipient": alloc["buyer_phone"],
                "recipient_name": alloc["buyer_name"],
                "type": f"{channel}_{msg_type}",
                "stand_id": alloc["stand_id"],
                "text": text,
                "status": "DELIVERED",
                "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            outbound_messages_store.append(new_msg)

            sig = security_guard.sign_transaction(new_msg)
            security_guard.log_security_event(user_role, "SEND_PAYMENT_REMINDER", f"{channel} reminder sent to {alloc['buyer_name']} for {alloc['stand_id']}")

            self._send_json(200, {
                "dispatched_message": new_msg,
                "hmac_signature": sig,
                "channel": channel,
                "status": "DELIVERED"
            })
            return

        # =========================================================
        # 40. Live EcoCash Push & Installment Settlement
        # =========================================================
        if path == "/api/payments/ecocash-settle":
            alloc_id = security_guard.sanitize(body.get("allocation_id", ""))
            stand_id = security_guard.sanitize(body.get("stand_id", "STAND-001"))
            usd = float(body.get("amount_usd", 312.50))
            payer_phone = security_guard.sanitize(body.get("payer_phone", "+263 773 111222"))
            zwg_rate = float(body.get("fx_rate", 26.50))

            alloc = next((a for a in allocations_store if a["stand_id"] == stand_id or a["allocation_id"] == alloc_id), None)
            if alloc:
                alloc["paid_to_date_usd"] = round(alloc["paid_to_date_usd"] + usd, 2)
                alloc["balance_usd"] = max(0.0, round(alloc["balance_usd"] - usd, 2))
                alloc["instalments_paid"] += 1
                if alloc["balance_usd"] == 0:
                    alloc["status"] = "FULLY_PAID_DEED_PENDING"
                    alloc["title_deed_eligible"] = True

            rec_no = f"REC-ECO-{int(round(usd)) + 200}"
            zwg_amount = round(usd * zwg_rate, 2)

            # Auto SMS/WhatsApp payment confirmation receipt
            conf_msg = {
                "message_id": f"MSG-2026-{len(outbound_messages_store) + 101:03d}",
                "recipient": payer_phone,
                "recipient_name": alloc["buyer_name"] if alloc else "Valued Buyer",
                "type": "ECOCASH_RECEIPT_SMS",
                "stand_id": stand_id,
                "text": f"Payment Verified: ${usd:,.2f} USD (ZWG {zwg_amount:,.2f}) received via EcoCash USSD Push for {stand_id}. Receipt #{rec_no}. Current balance: ${alloc['balance_usd']:,.2f} USD." if alloc else f"Payment of ${usd} received.",
                "status": "DELIVERED",
                "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            outbound_messages_store.append(conf_msg)

            sig = security_guard.sign_transaction({"rec": rec_no, "stand": stand_id, "usd": usd, "balance": alloc["balance_usd"] if alloc else 0.0})
            security_guard.log_security_event(user_role, "ECOCASH_SETTLEMENT", f"EcoCash push settled ${usd} USD on {stand_id} (Rec #{rec_no})")

            self._send_json(200, {
                "receipt_number": rec_no,
                "stand_id": stand_id,
                "amount_usd": usd,
                "amount_zwg": zwg_amount,
                "allocation": alloc,
                "confirmation_message": conf_msg,
                "hmac_signature": sig,
                "status": "SETTLED"
            })
            return

        self._send_json(404, {"error": "API Endpoint Not Found"})


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_server(port: int = PORT):
    handler = SecureERPRequestHandler
    with ThreadedTCPServer(("", port), handler) as httpd:
        print(f"[SECURE] Zimbuild Secure ERP Platform running on http://localhost:{port} (PORT {port})")
        httpd.serve_forever()


if __name__ == "__main__":
    run_server(PORT)
