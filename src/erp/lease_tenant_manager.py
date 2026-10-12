"""
Zimbuild ERP - Lease Lifecycle Management & Tenant CRM
Automated escalations, lease abstraction, tenant onboarding, and self-service portal APIs.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta

@dataclass
class MaintenanceTicket:
    ticket_id: str
    tenant_id: str
    property_id: str
    unit_id: str
    category: str  # Plumbing, Electrical, HVAC, Structural, Security
    description: str
    priority: str  # Low, Medium, High, Emergency
    status: str = "Open"  # Open, Assigned, In Progress, Resolved
    assigned_contractor: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M"))
    estimated_cost_usd: float = 0.0

@dataclass
class TenantProfile:
    tenant_id: str
    full_name: str
    id_or_company_reg: str
    email: str
    phone: str
    credit_score: int  # 300 - 850
    credit_status: str  # Approved, Conditional, Rejected
    screening_notes: str
    onboarding_checklist: Dict[str, bool] = field(default_factory=lambda: {
        "id_document_verified": True,
        "proof_of_income_verified": True,
        "security_deposit_paid": True,
        "digital_lease_signed": True,
        "move_in_inspection_completed": True,
        "keys_and_access_issued": True
    })
    ledger_balance_usd: float = 0.0  # Positive = owed, Negative = credit

@dataclass
class LeaseAgreement:
    lease_id: str
    property_id: str
    unit_id: str
    tenant_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    base_rent_usd: float
    current_rent_usd: float
    deposit_held_usd: float
    escalation_rate_pct: float  # e.g., 7.5% per annum
    escalation_frequency_months: int = 12
    status: str = "Active"  # Active, Pending Renewal, Terminated, Expired
    critical_alerts: List[str] = field(default_factory=list)

    def calculate_next_escalation(self) -> Dict[str, float]:
        """Calculates next rent escalation amount based on contractual escalation percentage."""
        escalated_rent = self.current_rent_usd * (1 + (self.escalation_rate_pct / 100.0))
        rent_increase = escalated_rent - self.current_rent_usd
        return {
            "current_rent_usd": round(self.current_rent_usd, 2),
            "escalation_rate_pct": self.escalation_rate_pct,
            "annual_escalated_rent_usd": round(escalated_rent, 2),
            "monthly_increase_usd": round(rent_increase, 2)
        }

    def generate_lease_abstraction(self, property_name: str, tenant_name: str) -> Dict:
        """Produces formal executive lease abstraction report."""
        return {
            "lease_reference": self.lease_id,
            "property_name": property_name,
            "unit_reference": self.unit_id,
            "tenant_name": tenant_name,
            "lease_commencement": self.start_date,
            "lease_expiration": self.end_date,
            "base_monthly_rent_usd": self.base_rent_usd,
            "current_monthly_rent_usd": self.current_rent_usd,
            "annualized_rent_usd": round(self.current_rent_usd * 12, 2),
            "security_deposit_held": self.deposit_held_usd,
            "escalation_clause": f"{self.escalation_rate_pct}% compounding every {self.escalation_frequency_months} months",
            "statutory_compliance": "Governed by Commercial Premises (Rent) Regulations & Deeds Registries Act",
            "critical_dates": {
                "renewal_notice_deadline": self._calculate_notice_date(60),
                "option_to_renew": "3-year extension subject to market appraisal"
            }
        }

    def _calculate_notice_date(self, notice_days: int) -> str:
        try:
            exp_date = datetime.strptime(self.end_date, "%Y-%m-%d").date()
            notice_date = exp_date - timedelta(days=notice_days)
            return notice_date.strftime("%Y-%m-%d")
        except Exception:
            return "60 Days Prior Expiration"


class LeaseTenantManager:
    """Enterprise CRM and automated lease lifecycle controller."""

    def __init__(self):
        self.tenants: Dict[str, TenantProfile] = {}
        self.leases: Dict[str, LeaseAgreement] = {}
        self.maintenance_tickets: List[MaintenanceTicket] = []
        self._seed_default_data()

    def _seed_default_data(self):
        # 1. Tenants
        t1 = TenantProfile(
            tenant_id="TEN-001",
            full_name="Stanbic Bank Zimbabwe Corporate Agency",
            id_or_company_reg="CO-REG-10492/ZW",
            email="commercial@stanbic.co.zw",
            phone="+263 242 799000",
            credit_score=810,
            credit_status="Approved",
            screening_notes="Tier 1 Institutional Banking tenant. AAA rating."
        )
        t2 = TenantProfile(
            tenant_id="TEN-002",
            full_name="Aroma Caffé & Roastery Ltd",
            id_or_company_reg="CO-REG-98214/ZW",
            email="finance@aromacaffe.co.zw",
            phone="+263 772 411890",
            credit_score=720,
            credit_status="Approved",
            screening_notes="Established hospitality operator with 4 national branches."
        )
        t3 = TenantProfile(
            tenant_id="TEN-006",
            full_name="Eng. Farai Makoni (Hwange Colliery Senior Staff)",
            id_or_company_reg="63-948192-B-42",
            email="fmakoni@hwangecoll.co.zw",
            phone="+263 774 192834",
            credit_score=765,
            credit_status="Approved",
            screening_notes="Corporate lease guarantee through Hwange Colliery."
        )
        self.tenants[t1.tenant_id] = t1
        self.tenants[t2.tenant_id] = t2
        self.tenants[t3.tenant_id] = t3

        # 2. Leases
        today = date.today()
        l1 = LeaseAgreement(
            lease_id="LSE-001",
            property_id="PROP-HRE-001",
            unit_id="U-PV-01",
            tenant_id="TEN-001",
            start_date="2023-01-01",
            end_date="2027-12-31",
            base_rent_usd=2800.0,
            current_rent_usd=3010.0,
            deposit_held_usd=5600.0,
            escalation_rate_pct=7.5,
            critical_alerts=["Annual escalation due in 45 days"]
        )
        l2 = LeaseAgreement(
            lease_id="LSE-002",
            property_id="PROP-HRE-001",
            unit_id="U-PV-02",
            tenant_id="TEN-002",
            start_date="2024-03-01",
            end_date="2026-11-30",
            base_rent_usd=1100.0,
            current_rent_usd=1100.0,
            deposit_held_usd=2200.0,
            escalation_rate_pct=8.0,
            critical_alerts=["Lease expiration within 60 days - Renewal Campaign Triggered"]
        )
        self.leases[l1.lease_id] = l1
        self.leases[l2.lease_id] = l2

        # 3. Tickets
        self.maintenance_tickets.append(
            MaintenanceTicket(
                ticket_id="TKT-801",
                tenant_id="TEN-002",
                property_id="PROP-HRE-001",
                unit_id="U-PV-02",
                category="Plumbing",
                description="Grease trap water pressure backflow in kitchen drainage",
                priority="High",
                status="Assigned",
                assigned_contractor="AquaFlow Zimbabwe Civil & Plumbing",
                estimated_cost_usd=180.0
            )
        )

    def screen_tenant(self, full_name: str, id_reg: str, salary_or_revenue_usd: float, monthly_rent: float) -> TenantProfile:
        """Automated credit screening based on Debt-to-Income / Rent Coverage Ratio."""
        coverage_ratio = salary_or_revenue_usd / monthly_rent if monthly_rent > 0 else 0
        if coverage_ratio >= 3.5:
            score = 780
            status = "Approved"
            notes = f"Rent-to-income ratio {coverage_ratio:.1f}x exceeds 3.5x threshold. Approved."
        elif coverage_ratio >= 2.5:
            score = 660
            status = "Conditional"
            notes = f"Rent-to-income ratio {coverage_ratio:.1f}x. Approved subject to 2 months security deposit."
        else:
            score = 520
            status = "Rejected"
            notes = f"Insufficient income coverage ({coverage_ratio:.1f}x < 2.5x). Financial guarantor required."

        tenant = TenantProfile(
            tenant_id=f"TEN-{len(self.tenants)+1:03d}",
            full_name=full_name,
            id_or_company_reg=id_reg,
            email=f"{full_name.lower().replace(' ', '.')}@example.com",
            phone="+263 770 000000",
            credit_score=score,
            credit_status=status,
            screening_notes=notes
        )
        self.tenants[tenant.tenant_id] = tenant
        return tenant

    def submit_maintenance_ticket(self, tenant_id: str, property_id: str, unit_id: str, category: str, description: str, priority: str = "Medium") -> MaintenanceTicket:
        """Self-service tenant maintenance dispatch."""
        ticket = MaintenanceTicket(
            ticket_id=f"TKT-{len(self.maintenance_tickets)+801:03d}",
            tenant_id=tenant_id,
            property_id=property_id,
            unit_id=unit_id,
            category=category,
            description=description,
            priority=priority,
            status="Open",
            estimated_cost_usd=120.0
        )
        self.maintenance_tickets.append(ticket)
        return ticket

    def get_tenant_portal_overview(self, tenant_id: str) -> Dict:
        """Self-service portal endpoint returning active lease, ledger, and tickets."""
        tenant = self.tenants.get(tenant_id)
        if not tenant:
            return {"error": "Tenant not found"}
        
        tenant_leases = [l for l in self.leases.values() if l.tenant_id == tenant_id]
        tenant_tickets = [t for t in self.maintenance_tickets if t.tenant_id == tenant_id]

        return {
            "tenant_id": tenant.tenant_id,
            "full_name": tenant.full_name,
            "ledger_balance_usd": tenant.ledger_balance_usd,
            "credit_score": tenant.credit_score,
            "active_leases": [
                {
                    "lease_id": l.lease_id,
                    "unit_id": l.unit_id,
                    "current_rent_usd": l.current_rent_usd,
                    "end_date": l.end_date,
                    "critical_alerts": l.critical_alerts
                }
                for l in tenant_leases
            ],
            "maintenance_tickets": [
                {
                    "ticket_id": t.ticket_id,
                    "category": t.category,
                    "description": t.description,
                    "priority": t.priority,
                    "status": t.status,
                    "created_at": t.created_at
                }
                for t in tenant_tickets
            ]
        }
