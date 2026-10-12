"""
Zimbuild ERP - Sales, Customer Experience & Digital Channels Engine
Unified CRM & Sales Pipeline Architecture for Real Estate & Construction.
Tracks:
- Real Estate Inquiries across digital & physical channels (WhatsApp, Web, EcoCash Portal, Walk-in)
- Client Communication History & interaction timeline (WhatsApp, Calls, Meetings, SMS)
- Multi-Stage Sales Pipelines (Inquiry -> Qualified -> Site Visit -> Quotation -> KYC/DLAP -> Reservation -> AOS -> Closed Won)
- Customer Relationship Management (360-degree Customer Profiles, Lead Scoring, CLV, Diaspora tagging)
- Digital Channel Performance & Customer Experience (CX) SLA Metrics
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime, date, timedelta
import uuid


# ---------------------------------------------------------------------------
# Enums and Constants
# ---------------------------------------------------------------------------

PIPELINE_STAGES = [
    "1_INQUIRY_CAPTURED",
    "2_CONTACT_QUALIFIED",
    "3_SITE_VISIT_SCHEDULED",
    "4_PROPOSAL_QUOTATION",
    "5_KYC_DLAP_SCREENING",
    "6_RESERVATION_DEPOSIT",
    "7_AGREEMENT_OF_SALE",
    "8_CLOSED_WON",
    "CLOSED_LOST"
]

STAGE_PROBABILITIES: Dict[str, int] = {
    "1_INQUIRY_CAPTURED": 10,
    "2_CONTACT_QUALIFIED": 25,
    "3_SITE_VISIT_SCHEDULED": 45,
    "4_PROPOSAL_QUOTATION": 60,
    "5_KYC_DLAP_SCREENING": 75,
    "6_RESERVATION_DEPOSIT": 90,
    "7_AGREEMENT_OF_SALE": 95,
    "8_CLOSED_WON": 100,
    "CLOSED_LOST": 0
}

DIGITAL_CHANNELS = [
    "WHATSAPP_BOT",
    "WEBSITE_PORTAL",
    "ECOCASH_DIGITAL",
    "WALK_IN_OFFICE",
    "SOCIAL_MEDIA",
    "DIASPORA_DESK",
    "PHONE_CALL"
]


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class RealEstateInquiry:
    inquiry_id: str
    customer_name: str
    phone: str
    email: str
    source_channel: str          # WHATSAPP_BOT, WEBSITE_PORTAL, WALK_IN_OFFICE, etc.
    property_interest: str       # e.g., "Stand 412 Parkview Heights", "High-Rise Commercial"
    budget_usd: float
    budget_zwg: float
    status: str                  # NEW, QUALIFIED, IN_PIPELINE, CONVERTED, CLOSED_LOST
    assigned_agent: str
    notes: str
    created_at: str              # YYYY-MM-DD HH:MM
    urgency: str = "Medium"      # Low, Medium, High, Immediate
    is_diaspora: bool = False
    diaspora_country: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "inquiry_id": self.inquiry_id,
            "customer_name": self.customer_name,
            "phone": self.phone,
            "email": self.email,
            "source_channel": self.source_channel,
            "property_interest": self.property_interest,
            "budget_usd": self.budget_usd,
            "budget_zwg": self.budget_zwg,
            "status": self.status,
            "assigned_agent": self.assigned_agent,
            "notes": self.notes,
            "created_at": self.created_at,
            "urgency": self.urgency,
            "is_diaspora": self.is_diaspora,
            "diaspora_country": self.diaspora_country
        }


@dataclass
class CommunicationRecord:
    comm_id: str
    customer_id_or_name: str
    inquiry_or_deal_ref: str
    channel: str                 # WHATSAPP, PHONE_CALL, IN_PERSON, EMAIL, SMS, PORTAL
    direction: str               # INBOUND, OUTBOUND
    agent_name: str
    summary: str
    client_sentiment: str        # Positive, Neutral, Hesitant, Escalated, Enthusiastic
    timestamp: str               # YYYY-MM-DD HH:MM
    follow_up_action: Optional[str] = None
    follow_up_date: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "comm_id": self.comm_id,
            "customer_id_or_name": self.customer_id_or_name,
            "inquiry_or_deal_ref": self.inquiry_or_deal_ref,
            "channel": self.channel,
            "direction": self.direction,
            "agent_name": self.agent_name,
            "summary": self.summary,
            "client_sentiment": self.client_sentiment,
            "timestamp": self.timestamp,
            "follow_up_action": self.follow_up_action,
            "follow_up_date": self.follow_up_date
        }


@dataclass
class SalesDeal:
    deal_id: str
    title: str
    customer_id: str
    customer_name: str
    stand_or_property_id: str
    deal_value_usd: float
    deal_value_zwg: float
    stage: str                   # From PIPELINE_STAGES
    probability_pct: int
    payment_terms: str           # Cash Outright, 12 Months Amortized, 24 Months Amortized
    assigned_agent: str
    expected_close_date: str
    days_in_stage: int = 1
    closed_reason: Optional[str] = None
    linked_inquiry_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))

    def to_dict(self) -> Dict[str, Any]:
        weighted_val = round(self.deal_value_usd * (self.probability_pct / 100.0), 2)
        return {
            "deal_id": self.deal_id,
            "title": self.title,
            "customer_id": self.customer_id,
            "customer_name": self.customer_name,
            "stand_or_property_id": self.stand_or_property_id,
            "deal_value_usd": self.deal_value_usd,
            "deal_value_zwg": self.deal_value_zwg,
            "stage": self.stage,
            "probability_pct": self.probability_pct,
            "weighted_value_usd": weighted_val,
            "payment_terms": self.payment_terms,
            "assigned_agent": self.assigned_agent,
            "expected_close_date": self.expected_close_date,
            "days_in_stage": self.days_in_stage,
            "closed_reason": self.closed_reason,
            "linked_inquiry_id": self.linked_inquiry_id,
            "created_at": self.created_at
        }


@dataclass
class CustomerProfile:
    customer_id: str
    full_name: str
    national_id_or_passport: str
    phone: str
    email: str
    category: str                # LOCAL_FIRST_TIME, DIASPORA_INVESTOR, CORPORATE, YOUTH_QUOTA, HIGH_NET_WORTH
    is_diaspora: bool
    diaspora_country: Optional[str]
    lead_score: int              # 0 - 100
    customer_lifetime_value_usd: float
    satisfaction_rating: float   # 1.0 - 5.0
    tags: List[str] = field(default_factory=list)
    linked_inquiries: List[str] = field(default_factory=list)
    linked_deals: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "customer_id": self.customer_id,
            "full_name": self.full_name,
            "national_id_or_passport": self.national_id_or_passport,
            "phone": self.phone,
            "email": self.email,
            "category": self.category,
            "is_diaspora": self.is_diaspora,
            "diaspora_country": self.diaspora_country,
            "lead_score": self.lead_score,
            "customer_lifetime_value_usd": self.customer_lifetime_value_usd,
            "satisfaction_rating": self.satisfaction_rating,
            "tags": self.tags,
            "linked_inquiries": self.linked_inquiries,
            "linked_deals": self.linked_deals,
            "created_at": self.created_at
        }


# ---------------------------------------------------------------------------
# Core Sales CRM Pipeline Manager Engine
# ---------------------------------------------------------------------------

class SalesCRMPipelineManager:
    """Enterprise Real Estate CRM, Inquiry Tracker & Pipeline Velocity Controller."""

    def __init__(self, rbz_zwg_rate: float = 26.50):
        self.rbz_zwg_rate = rbz_zwg_rate
        self.inquiries: Dict[str, RealEstateInquiry] = {}
        self.communications: List[CommunicationRecord] = []
        self.deals: Dict[str, SalesDeal] = {}
        self.customers: Dict[str, CustomerProfile] = {}
        self._seed_default_data()

    def _seed_default_data(self):
        """Seeds high-fidelity initial real estate inquiries, CRM leads, and active deals."""
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

        # 1. Default Customers
        c1 = CustomerProfile(
            customer_id="CRM-CUST-101",
            full_name="Farai Chengeta",
            national_id_or_passport="63-289419-M-12",
            phone="+263 772 890 123",
            email="fchengeta@transmed.co.zw",
            category="LOCAL_FIRST_TIME",
            is_diaspora=False,
            diaspora_country=None,
            lead_score=88,
            customer_lifetime_value_usd=45000.0,
            satisfaction_rating=4.9,
            tags=["Cash Deposit Ready", "High-Rise Enthusiast", "Verified ZIMRA"]
        )
        c2 = CustomerProfile(
            customer_id="CRM-CUST-102",
            full_name="Nyasha Chidzero",
            national_id_or_passport="GB-PASSPORT-981249",
            phone="+44 7700 900142",
            email="nyasha.chidzero@londonfin.co.uk",
            category="DIASPORA_INVESTOR",
            is_diaspora=True,
            diaspora_country="United Kingdom",
            lead_score=94,
            customer_lifetime_value_usd=120000.0,
            satisfaction_rating=5.0,
            tags=["Diaspora UK", "Multiple Stands", "Mortgage Pre-approved"]
        )
        c3 = CustomerProfile(
            customer_id="CRM-CUST-103",
            full_name="Tatenda Mabika",
            national_id_or_passport="63-882194-P-44",
            phone="+263 774 551 890",
            email="tmabika@agribiz.co.zw",
            category="YOUTH_QUOTA",
            is_diaspora=False,
            diaspora_country=None,
            lead_score=76,
            customer_lifetime_value_usd=18500.0,
            satisfaction_rating=4.7,
            tags=["Youth Scheme (<=35)", "EcoCash Payer", "Harare North"]
        )
        c4 = CustomerProfile(
            customer_id="CRM-CUST-104",
            full_name="Apex Logistics (Pvt) Ltd",
            national_id_or_passport="CO-REG-84920/ZW",
            phone="+263 242 884910",
            email="procurement@apexlogistics.co.zw",
            category="COMMERCIAL_ENTERPRISE",
            is_diaspora=False,
            diaspora_country=None,
            lead_score=92,
            customer_lifetime_value_usd=250000.0,
            satisfaction_rating=4.8,
            tags=["Industrial Park", "Warehouse Build", "Corporate Tax Verified"]
        )

        for c in [c1, c2, c3, c4]:
            self.customers[c.customer_id] = c

        # 2. Inquiries across Digital Channels
        inq1 = RealEstateInquiry(
            inquiry_id="INQ-2026-001",
            customer_name="Farai Chengeta",
            phone="+263 772 890 123",
            email="fchengeta@transmed.co.zw",
            source_channel="WHATSAPP_BOT",
            property_interest="Stand 412 Parkview Heights Township (Harare)",
            budget_usd=35000.0,
            budget_zwg=round(35000.0 * self.rbz_zwg_rate, 2),
            status="IN_PIPELINE",
            assigned_agent="Tapiwa Zhou (Senior Sales Exec)",
            notes="Inquired via 24/7 WhatsApp AI Bot regarding 2,500 sqm high-rise residential stand.",
            created_at="2026-10-01 09:15",
            urgency="High",
            is_diaspora=False
        )
        inq2 = RealEstateInquiry(
            inquiry_id="INQ-2026-002",
            customer_name="Nyasha Chidzero",
            phone="+44 7700 900142",
            email="nyasha.chidzero@londonfin.co.uk",
            source_channel="DIASPORA_DESK",
            property_interest="Harare Highlands North Extension - Executive Cluster",
            budget_usd=85000.0,
            budget_zwg=round(85000.0 * self.rbz_zwg_rate, 2),
            status="IN_PIPELINE",
            assigned_agent="Chipo Marufu (Diaspora Portfolio Lead)",
            notes="UK Diaspora buyer requesting virtual drone survey & legal conveyance pack.",
            created_at="2026-10-03 14:30",
            urgency="High",
            is_diaspora=True,
            diaspora_country="United Kingdom"
        )
        inq3 = RealEstateInquiry(
            inquiry_id="INQ-2026-003",
            customer_name="Tatenda Mabika",
            phone="+263 774 551 890",
            email="tmabika@agribiz.co.zw",
            source_channel="ECOCASH_DIGITAL",
            property_interest="Stand 104 Kadoma Industrial / Residential Mixed-Use",
            budget_usd=12000.0,
            budget_zwg=round(12000.0 * self.rbz_zwg_rate, 2),
            status="QUALIFIED",
            assigned_agent="Blessing Hove (Youth Desk Officer)",
            notes="Applied through mobile EcoCash mini-portal under 40% Youth Allocation statutory quota.",
            created_at="2026-10-05 11:00",
            urgency="Medium",
            is_diaspora=False
        )
        inq4 = RealEstateInquiry(
            inquiry_id="INQ-2026-004",
            customer_name="Apex Logistics (Pvt) Ltd",
            phone="+263 242 884910",
            email="procurement@apexlogistics.co.zw",
            source_channel="WEBSITE_PORTAL",
            property_interest="Kadoma Industrial Estate Heavy Commercial Zone",
            budget_usd=150000.0,
            budget_zwg=round(150000.0 * self.rbz_zwg_rate, 2),
            status="IN_PIPELINE",
            assigned_agent="Tapiwa Zhou (Senior Sales Exec)",
            notes="Direct web portal inquiry requesting BoQ and DLAP title deed verification.",
            created_at="2026-10-06 16:45",
            urgency="High",
            is_diaspora=False
        )

        for inq in [inq1, inq2, inq3, inq4]:
            self.inquiries[inq.inquiry_id] = inq

        # Link to customer profiles
        c1.linked_inquiries.append(inq1.inquiry_id)
        c2.linked_inquiries.append(inq2.inquiry_id)
        c3.linked_inquiries.append(inq3.inquiry_id)
        c4.linked_inquiries.append(inq4.inquiry_id)

        # 3. Communication History
        comms = [
            CommunicationRecord(
                comm_id="COMM-8001",
                customer_id_or_name="Farai Chengeta",
                inquiry_or_deal_ref="INQ-2026-001",
                channel="WHATSAPP",
                direction="INBOUND",
                agent_name="Zimbuild AI Digital Channel Assistant",
                summary="Client sent WhatsApp message inquiring on Stand 412 pricing & water reticulation status.",
                client_sentiment="Positive",
                timestamp="2026-10-01 09:15",
                follow_up_action="Share PDF cadastral beacon diagram & pricing matrix",
                follow_up_date="2026-10-01"
            ),
            CommunicationRecord(
                comm_id="COMM-8002",
                customer_id_or_name="Farai Chengeta",
                inquiry_or_deal_ref="DEAL-1001",
                channel="PHONE_CALL",
                direction="OUTBOUND",
                agent_name="Tapiwa Zhou",
                summary="Conducted 20-minute phone call. Client confirmed ability to pay 30% cash deposit ($10,500).",
                client_sentiment="Enthusiastic",
                timestamp="2026-10-02 11:30",
                follow_up_action="Schedule physical site viewing with Land Surveyor",
                follow_up_date="2026-10-04"
            ),
            CommunicationRecord(
                comm_id="COMM-8003",
                customer_id_or_name="Farai Chengeta",
                inquiry_or_deal_ref="DEAL-1001",
                channel="IN_PERSON",
                direction="INBOUND",
                agent_name="Tapiwa Zhou & Resident Engineer",
                summary="Client attended Parkview Heights site visit. Inspected tarred access road and sewer pegging.",
                client_sentiment="Positive",
                timestamp="2026-10-04 14:00",
                follow_up_action="Issue formal 24-Month Amortization Quotation & DLAP Title Abstract",
                follow_up_date="2026-10-05"
            ),
            CommunicationRecord(
                comm_id="COMM-8004",
                customer_id_or_name="Nyasha Chidzero",
                inquiry_or_deal_ref="DEAL-1002",
                channel="WHATSAPP",
                direction="OUTBOUND",
                agent_name="Chipo Marufu",
                summary="Sent 4K drone flyover video and SI 76/2025 DLAP Digital Deed verification token to London client.",
                client_sentiment="Enthusiastic",
                timestamp="2026-10-04 18:20",
                follow_up_action="Prepare Agreement of Sale for electronic signature",
                follow_up_date="2026-10-08"
            ),
            CommunicationRecord(
                comm_id="COMM-8005",
                customer_id_or_name="Tatenda Mabika",
                inquiry_or_deal_ref="INQ-2026-003",
                channel="SMS",
                direction="OUTBOUND",
                agent_name="Automated Digital Messaging Gateway",
                summary="Sent SMS notification: 'Your Youth Stand Application #INQ-2026-003 has been vetted and approved.'",
                client_sentiment="Neutral",
                timestamp="2026-10-05 11:05",
                follow_up_action="Call to explain EcoCash deposit payment code",
                follow_up_date="2026-10-07"
            ),
            CommunicationRecord(
                comm_id="COMM-8006",
                customer_id_or_name="Apex Logistics (Pvt) Ltd",
                inquiry_or_deal_ref="DEAL-1003",
                channel="EMAIL",
                direction="INBOUND",
                agent_name="Tapiwa Zhou",
                summary="Received corporate board resolution and ZIMRA ITF263 tax clearance certificate for warehouse land.",
                client_sentiment="Positive",
                timestamp="2026-10-07 10:15",
                follow_up_action="Conveyancing clearance with Deeds Office",
                follow_up_date="2026-10-09"
            )
        ]
        self.communications.extend(comms)

        # 4. Deals in Sales Pipeline
        d1 = SalesDeal(
            deal_id="DEAL-1001",
            title="Parkview Stand 412 - Executive Residential Acquisition",
            customer_id="CRM-CUST-101",
            customer_name="Farai Chengeta",
            stand_or_property_id="STAND-412-PVH",
            deal_value_usd=35000.0,
            deal_value_zwg=round(35000.0 * self.rbz_zwg_rate, 2),
            stage="6_RESERVATION_DEPOSIT",
            probability_pct=90,
            payment_terms="30% Deposit ($10,500), Balance over 18 Months",
            assigned_agent="Tapiwa Zhou",
            expected_close_date="2026-10-20",
            days_in_stage=3,
            linked_inquiry_id="INQ-2026-001"
        )
        d2 = SalesDeal(
            deal_id="DEAL-1002",
            title="Highlands North Extension - Prime Cluster Development",
            customer_id="CRM-CUST-102",
            customer_name="Nyasha Chidzero",
            stand_or_property_id="STAND-HNE-008",
            deal_value_usd=85000.0,
            deal_value_zwg=round(85000.0 * self.rbz_zwg_rate, 2),
            stage="7_AGREEMENT_OF_SALE",
            probability_pct=95,
            payment_terms="Outright Nostro Bank Transfer",
            assigned_agent="Chipo Marufu",
            expected_close_date="2026-10-15",
            days_in_stage=2,
            linked_inquiry_id="INQ-2026-002"
        )
        d3 = SalesDeal(
            deal_id="DEAL-1003",
            title="Kadoma Heavy Industrial Park - 5,000 sqm Logistics Yard",
            customer_id="CRM-CUST-104",
            customer_name="Apex Logistics (Pvt) Ltd",
            stand_or_property_id="STAND-KAD-IND-01",
            deal_value_usd=150000.0,
            deal_value_zwg=round(150000.0 * self.rbz_zwg_rate, 2),
            stage="5_KYC_DLAP_SCREENING",
            probability_pct=75,
            payment_terms="50% Deposit ($75,000), 50% on Transfer",
            assigned_agent="Tapiwa Zhou",
            expected_close_date="2026-11-05",
            days_in_stage=4,
            linked_inquiry_id="INQ-2026-004"
        )
        d4 = SalesDeal(
            deal_id="DEAL-1004",
            title="Kadoma Mixed-Use Stand 104 - Youth Quota Initiative",
            customer_id="CRM-CUST-103",
            customer_name="Tatenda Mabika",
            stand_or_property_id="STAND-KAD-104",
            deal_value_usd=12000.0,
            deal_value_zwg=round(12000.0 * self.rbz_zwg_rate, 2),
            stage="4_PROPOSAL_QUOTATION",
            probability_pct=60,
            payment_terms="24 Months Amortized with EcoCash",
            assigned_agent="Blessing Hove",
            expected_close_date="2026-10-30",
            days_in_stage=5,
            linked_inquiry_id="INQ-2026-003"
        )
        d5 = SalesDeal(
            deal_id="DEAL-1005",
            title="Chitungwiza Commercial Plaza - Retail Anchor Stand",
            customer_id="CRM-CUST-101",
            customer_name="Farai Chengeta",
            stand_or_property_id="STAND-CHT-COMM-02",
            deal_value_usd=48000.0,
            deal_value_zwg=round(48000.0 * self.rbz_zwg_rate, 2),
            stage="8_CLOSED_WON",
            probability_pct=100,
            payment_terms="Full Cash Settlement Completed",
            assigned_agent="Tapiwa Zhou",
            expected_close_date="2026-09-28",
            days_in_stage=12
        )

        for d in [d1, d2, d3, d4, d5]:
            self.deals[d.deal_id] = d

        c1.linked_deals.extend([d1.deal_id, d5.deal_id])
        c2.linked_deals.append(d2.deal_id)
        c4.linked_deals.append(d3.deal_id)
        c3.linked_deals.append(d4.deal_id)

    # -----------------------------------------------------------------------
    # Inquiries Management
    # -----------------------------------------------------------------------

    def create_inquiry(
        self,
        customer_name: str,
        phone: str,
        email: str,
        source_channel: str,
        property_interest: str,
        budget_usd: float,
        notes: str = "",
        assigned_agent: str = "Tapiwa Zhou",
        urgency: str = "Medium",
        is_diaspora: bool = False,
        diaspora_country: Optional[str] = None
    ) -> RealEstateInquiry:
        """Logs a new real estate inquiry from omnichannel source (Web, WhatsApp, Walk-in, etc.)."""
        inquiry_id = f"INQ-2026-{len(self.inquiries) + 1:03d}"
        budget_zwg = round(budget_usd * self.rbz_zwg_rate, 2)
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M")

        inq = RealEstateInquiry(
            inquiry_id=inquiry_id,
            customer_name=customer_name,
            phone=phone,
            email=email,
            source_channel=source_channel,
            property_interest=property_interest,
            budget_usd=budget_usd,
            budget_zwg=budget_zwg,
            status="NEW",
            assigned_agent=assigned_agent,
            notes=notes,
            created_at=created_at,
            urgency=urgency,
            is_diaspora=is_diaspora,
            diaspora_country=diaspora_country
        )
        self.inquiries[inquiry_id] = inq

        # Auto create or link customer profile
        cust = self.find_customer_by_phone_or_email(phone, email)
        if not cust:
            category = "DIASPORA_INVESTOR" if is_diaspora else "LOCAL_FIRST_TIME"
            cust = self.create_or_update_customer(
                full_name=customer_name,
                national_id_or_passport="ID-PENDING",
                phone=phone,
                email=email,
                category=category,
                is_diaspora=is_diaspora,
                diaspora_country=diaspora_country,
                budget_usd=budget_usd
            )
        else:
            cust.lead_score = max(cust.lead_score, self.calculate_lead_score(is_diaspora, True, budget_usd))
        if inquiry_id not in cust.linked_inquiries:
            cust.linked_inquiries.append(inquiry_id)

        # Log initial automatic communication log
        self.log_communication(
            customer_id_or_name=customer_name,
            inquiry_or_deal_ref=inquiry_id,
            channel="WHATSAPP" if "WHATSAPP" in source_channel else "PORTAL",
            direction="INBOUND",
            agent_name="Omnichannel Intake Gateway",
            summary=f"Inquiry logged via {source_channel}: Interest in {property_interest} (Budget ${budget_usd:,.2f})",
            client_sentiment="Positive",
            follow_up_action="Assign sales officer and send property portfolio brochure",
            follow_up_date=datetime.now().strftime("%Y-%m-%d")
        )

        return inq

    def get_inquiries(
        self,
        status: Optional[str] = None,
        source_channel: Optional[str] = None,
        is_diaspora: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """Returns filtered list of real estate inquiries."""
        result = []
        for inq in self.inquiries.values():
            if status and inq.status.upper() != status.upper():
                continue
            if source_channel and inq.source_channel.upper() != source_channel.upper():
                continue
            if is_diaspora is not None and inq.is_diaspora != is_diaspora:
                continue
            result.append(inq.to_dict())
        # Sort newest first
        result.sort(key=lambda x: x["created_at"], reverse=True)
        return result

    # -----------------------------------------------------------------------
    # Client Communication History
    # -----------------------------------------------------------------------

    def log_communication(
        self,
        customer_id_or_name: str,
        inquiry_or_deal_ref: str,
        channel: str,
        direction: str,
        agent_name: str,
        summary: str,
        client_sentiment: str = "Positive",
        follow_up_action: Optional[str] = None,
        follow_up_date: Optional[str] = None
    ) -> CommunicationRecord:
        """Appends a client interaction event to the chronological communication history."""
        comm_id = f"COMM-{len(self.communications) + 8001:04d}"
        rec = CommunicationRecord(
            comm_id=comm_id,
            customer_id_or_name=customer_id_or_name,
            inquiry_or_deal_ref=inquiry_or_deal_ref,
            channel=channel.upper(),
            direction=direction.upper(),
            agent_name=agent_name,
            summary=summary,
            client_sentiment=client_sentiment,
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            follow_up_action=follow_up_action,
            follow_up_date=follow_up_date
        )
        self.communications.append(rec)
        return rec

    def get_communication_history(
        self,
        customer_id_or_name: Optional[str] = None,
        inquiry_or_deal_ref: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Retrieves chronological client communication history."""
        filtered = []
        for c in reversed(self.communications):
            if customer_id_or_name:
                if (customer_id_or_name.lower() not in c.customer_id_or_name.lower()):
                    continue
            if inquiry_or_deal_ref:
                if (inquiry_or_deal_ref.lower() not in c.inquiry_or_deal_ref.lower()):
                    continue
            filtered.append(c.to_dict())
            if len(filtered) >= limit:
                break
        return filtered

    # -----------------------------------------------------------------------
    # Sales Pipeline Management
    # -----------------------------------------------------------------------

    def create_deal(
        self,
        title: str,
        customer_name: str,
        stand_or_property_id: str,
        deal_value_usd: float,
        payment_terms: str,
        assigned_agent: str = "Tapiwa Zhou",
        initial_stage: str = "1_INQUIRY_CAPTURED",
        linked_inquiry_id: Optional[str] = None,
        expected_close_days: int = 30
    ) -> SalesDeal:
        """Creates a deal in the sales pipeline."""
        deal_id = f"DEAL-{len(self.deals) + 1001:04d}"
        deal_value_zwg = round(deal_value_usd * self.rbz_zwg_rate, 2)
        prob = STAGE_PROBABILITIES.get(initial_stage, 10)
        close_date = (date.today() + timedelta(days=expected_close_days)).strftime("%Y-%m-%d")

        # Find or create customer
        cust = self.find_customer_by_name(customer_name)
        customer_id = cust.customer_id if cust else f"CRM-CUST-{len(self.customers) + 101:03d}"

        deal = SalesDeal(
            deal_id=deal_id,
            title=title,
            customer_id=customer_id,
            customer_name=customer_name,
            stand_or_property_id=stand_or_property_id,
            deal_value_usd=deal_value_usd,
            deal_value_zwg=deal_value_zwg,
            stage=initial_stage,
            probability_pct=prob,
            payment_terms=payment_terms,
            assigned_agent=assigned_agent,
            expected_close_date=close_date,
            linked_inquiry_id=linked_inquiry_id
        )
        self.deals[deal_id] = deal

        if cust and deal_id not in cust.linked_deals:
            cust.linked_deals.append(deal_id)

        # Log transition in communication
        self.log_communication(
            customer_id_or_name=customer_name,
            inquiry_or_deal_ref=deal_id,
            channel="PORTAL",
            direction="OUTBOUND",
            agent_name=assigned_agent,
            summary=f"Created Deal '{title}' for ${deal_value_usd:,.2f} at stage {initial_stage}",
            client_sentiment="Positive"
        )

        return deal

    def advance_deal_stage(
        self,
        deal_id: str,
        new_stage: str,
        notes: str = "",
        closed_reason: Optional[str] = None
    ) -> SalesDeal:
        """Transitions a deal along the pipeline stages and updates probability and metrics."""
        deal = self.deals.get(deal_id)
        if not deal:
            raise ValueError(f"Deal {deal_id} not found in pipeline")

        if new_stage not in PIPELINE_STAGES:
            raise ValueError(f"Invalid pipeline stage: {new_stage}. Allowed: {PIPELINE_STAGES}")

        prev_stage = deal.stage
        deal.stage = new_stage
        deal.probability_pct = STAGE_PROBABILITIES.get(new_stage, 50)
        deal.days_in_stage = 0  # reset stage counter
        if closed_reason:
            deal.closed_reason = closed_reason

        # Log to communication history
        self.log_communication(
            customer_id_or_name=deal.customer_name,
            inquiry_or_deal_ref=deal_id,
            channel="PORTAL",
            direction="OUTBOUND",
            agent_name=deal.assigned_agent,
            summary=f"Pipeline Stage Transition: {prev_stage} -> {new_stage}. Notes: {notes or 'Standard progression'}",
            client_sentiment="Enthusiastic" if new_stage == "8_CLOSED_WON" else "Neutral"
        )

        return deal

    def get_pipeline_summary(self) -> Dict[str, Any]:
        """Calculates comprehensive sales pipeline velocity, conversion funnels, and weighted values."""
        stages_data: Dict[str, List[Dict[str, Any]]] = {s: [] for s in PIPELINE_STAGES}
        total_pipeline_val_usd = 0.0
        weighted_pipeline_val_usd = 0.0
        closed_won_val_usd = 0.0

        for deal in self.deals.values():
            d_dict = deal.to_dict()
            if deal.stage in stages_data:
                stages_data[deal.stage].append(d_dict)
            else:
                stages_data.setdefault(deal.stage, []).append(d_dict)

            if deal.stage != "CLOSED_LOST":
                total_pipeline_val_usd += deal.deal_value_usd
                weighted_pipeline_val_usd += d_dict["weighted_value_usd"]
            if deal.stage == "8_CLOSED_WON":
                closed_won_val_usd += deal.deal_value_usd

        # Stage Counts and Values
        stage_metrics = {}
        for s, d_list in stages_data.items():
            stg_val = sum(x["deal_value_usd"] for x in d_list)
            stg_wgt = sum(x["weighted_value_usd"] for x in d_list)
            stage_metrics[s] = {
                "count": len(d_list),
                "total_value_usd": round(stg_val, 2),
                "weighted_value_usd": round(stg_wgt, 2),
                "probability_pct": STAGE_PROBABILITIES.get(s, 0)
            }

        total_active_deals = sum(
            len(d_list) for s, d_list in stages_data.items()
            if s not in ("8_CLOSED_WON", "CLOSED_LOST")
        )

        return {
            "total_deals_count": len(self.deals),
            "active_pipeline_deals_count": total_active_deals,
            "total_pipeline_value_usd": round(total_pipeline_val_usd, 2),
            "total_pipeline_value_zwg": round(total_pipeline_val_usd * self.rbz_zwg_rate, 2),
            "weighted_pipeline_value_usd": round(weighted_pipeline_val_usd, 2),
            "closed_won_value_usd": round(closed_won_val_usd, 2),
            "currency_rate_zwg": self.rbz_zwg_rate,
            "stage_breakdown": stage_metrics,
            "stages": stages_data
        }

    # -----------------------------------------------------------------------
    # Customer Relationship Management (CRM)
    # -----------------------------------------------------------------------

    def create_or_update_customer(
        self,
        full_name: str,
        national_id_or_passport: str,
        phone: str,
        email: str,
        category: str = "LOCAL_FIRST_TIME",
        is_diaspora: bool = False,
        diaspora_country: Optional[str] = None,
        tags: Optional[List[str]] = None,
        budget_usd: float = 25000.0
    ) -> CustomerProfile:
        """Creates or updates a 360-degree customer CRM profile."""
        cust = self.find_customer_by_phone_or_email(phone, email)
        if not cust:
            cid = f"CRM-CUST-{len(self.customers) + 101:03d}"
            cust = CustomerProfile(
                customer_id=cid,
                full_name=full_name,
                national_id_or_passport=national_id_or_passport,
                phone=phone,
                email=email,
                category=category,
                is_diaspora=is_diaspora,
                diaspora_country=diaspora_country,
                lead_score=self.calculate_lead_score(is_diaspora, bool(phone and email), budget_usd),
                customer_lifetime_value_usd=0.0,
                satisfaction_rating=5.0,
                tags=tags or ["New Lead"]
            )
            self.customers[cid] = cust
        else:
            cust.full_name = full_name
            cust.national_id_or_passport = national_id_or_passport
            cust.category = category
            cust.is_diaspora = is_diaspora
            if diaspora_country:
                cust.diaspora_country = diaspora_country
            cust.lead_score = max(cust.lead_score, self.calculate_lead_score(is_diaspora, bool(phone and email), budget_usd))
            if tags:
                for t in tags:
                    if t not in cust.tags:
                        cust.tags.append(t)
        return cust

    def get_customer_360(self, customer_id: str) -> Dict[str, Any]:
        """Provides complete 360-degree customer view with profile, deals, and communication timeline."""
        cust = self.customers.get(customer_id)
        if not cust:
            # Fallback search by name
            cust = self.find_customer_by_name(customer_id)
            if not cust:
                return {"error": f"Customer '{customer_id}' not found"}

        # Fetch linked deals
        deals_list = [
            self.deals[did].to_dict()
            for did in cust.linked_deals
            if did in self.deals
        ]

        # Fetch linked inquiries
        inquiries_list = [
            self.inquiries[iid].to_dict()
            for iid in cust.linked_inquiries
            if iid in self.inquiries
        ]

        # Fetch timeline
        timeline = self.get_communication_history(customer_id_or_name=cust.full_name, limit=20)

        # Recalculate CLV
        clv = sum(d["deal_value_usd"] for d in deals_list if d["stage"] == "8_CLOSED_WON")
        cust.customer_lifetime_value_usd = clv

        return {
            "customer_profile": cust.to_dict(),
            "deals": deals_list,
            "inquiries": inquiries_list,
            "communication_timeline": timeline,
            "total_deals_value_usd": sum(d["deal_value_usd"] for d in deals_list),
            "lifetime_settled_value_usd": clv
        }

    def calculate_lead_score(self, is_diaspora: bool, has_phone_email: bool, budget_usd: float) -> int:
        """Computes 0-100 propensity lead score based on buyer profile, budget, and contact fidelity."""
        score = 50
        if is_diaspora:
            score += 20  # Strong foreign currency nostro capability
        if has_phone_email:
            score += 15  # Reachable on WhatsApp / Email
        if budget_usd >= 50000.0:
            score += 15
        elif budget_usd >= 20000.0:
            score += 10
        return min(score, 100)

    # -----------------------------------------------------------------------
    # Digital Channels & Customer Experience (CX) Analytics
    # -----------------------------------------------------------------------

    def get_digital_channels_and_cx_metrics(self) -> Dict[str, Any]:
        """Aggregates omnichannel performance, inquiry share, response SLAs, and CX CSAT metrics."""
        channel_counts = {ch: 0 for ch in DIGITAL_CHANNELS}
        channel_inquiry_val = {ch: 0.0 for ch in DIGITAL_CHANNELS}

        for inq in self.inquiries.values():
            ch = inq.source_channel
            if ch in channel_counts:
                channel_counts[ch] += 1
                channel_inquiry_val[ch] += inq.budget_usd
            else:
                channel_counts[ch] = 1
                channel_inquiry_val[ch] = inq.budget_usd

        total_inq = len(self.inquiries) or 1
        channel_percentages = {
            ch: round((cnt / total_inq) * 100, 1)
            for ch, cnt in channel_counts.items()
        }

        # Conversion rate (Inquiries with Won deals)
        won_deals = [d for d in self.deals.values() if d.stage == "8_CLOSED_WON"]
        conversion_rate_pct = round((len(won_deals) / total_inq) * 100, 1) if total_inq else 0

        # Customer Experience metrics
        all_ratings = [c.satisfaction_rating for c in self.customers.values()]
        avg_csat = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 4.8

        return {
            "total_inquiries": len(self.inquiries),
            "omnichannel_breakdown": {
                ch: {
                    "count": channel_counts.get(ch, 0),
                    "share_pct": channel_percentages.get(ch, 0.0),
                    "pipeline_potential_usd": round(channel_inquiry_val.get(ch, 0.0), 2)
                }
                for ch in DIGITAL_CHANNELS
            },
            "digital_response_sla_minutes": 4.2,  # Sub-5 minute WhatsApp/Web AI bot turnaround
            "overall_conversion_rate_pct": conversion_rate_pct,
            "customer_experience": {
                "csat_score_out_of_5": avg_csat,
                "nps_net_promoter_score": 72,
                "first_contact_resolution_rate_pct": 86.5,
                "average_client_interaction_count": round(len(self.communications) / max(len(self.customers), 1), 1)
            }
        }

    # -----------------------------------------------------------------------
    # Internal Helpers
    # -----------------------------------------------------------------------

    def find_customer_by_phone_or_email(self, phone: str, email: str) -> Optional[CustomerProfile]:
        for c in self.customers.values():
            if c.phone == phone or (c.email and c.email.lower() == email.lower()):
                return c
        return None

    def find_customer_by_name(self, name: str) -> Optional[CustomerProfile]:
        clean_name = name.strip().lower()
        for c in self.customers.values():
            if c.full_name.strip().lower() == clean_name:
                return c
        return None
