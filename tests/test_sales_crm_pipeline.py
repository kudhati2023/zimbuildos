"""
Unit tests for Zimbuild ERP - Sales, Customer Experience & Digital Channels Engine
Validates:
- Real Estate Inquiries across digital and physical channels
- Client Communication History logging and chronological audit trails
- Sales Pipeline stages, probabilities, weighted values, and stage transitions
- Customer Relationship Management 360-degree profiles and lead scoring
- Omnichannel CX analytics and conversion rates
"""

import pytest
from src.erp.sales_crm_pipeline import (
    SalesCRMPipelineManager,
    RealEstateInquiry,
    CommunicationRecord,
    SalesDeal,
    CustomerProfile,
    PIPELINE_STAGES,
    DIGITAL_CHANNELS,
    STAGE_PROBABILITIES,
)


def test_sales_crm_initialization():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)
    assert len(crm.inquiries) >= 4
    assert len(crm.deals) >= 5
    assert len(crm.communications) >= 6
    assert len(crm.customers) >= 4
    assert crm.rbz_zwg_rate == 26.50


def test_real_estate_inquiry_ingestion():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    # 1. Ingest WhatsApp Bot inquiry
    inq = crm.create_inquiry(
        customer_name="Kudakwashe Mandaza",
        phone="+263 773 112 233",
        email="kmandaza@health.gov.zw",
        source_channel="WHATSAPP_BOT",
        property_interest="Harare Highlands North Stand 204",
        budget_usd=40000.0,
        notes="Prospective buyer requested GPS coordinates & payment terms.",
        assigned_agent="Tapiwa Zhou",
        urgency="High",
        is_diaspora=False,
    )

    assert inq.inquiry_id.startswith("INQ-2026-")
    assert inq.customer_name == "Kudakwashe Mandaza"
    assert inq.budget_usd == 40000.0
    assert inq.budget_zwg == round(40000.0 * 26.50, 2)
    assert inq.status == "NEW"

    # Verify customer profile was auto-linked
    cust = crm.find_customer_by_phone_or_email(inq.phone, inq.email)
    assert cust is not None
    assert inq.inquiry_id in cust.linked_inquiries

    # Verify initial communication log was auto-recorded
    history = crm.get_communication_history(customer_id_or_name="Kudakwashe Mandaza")
    assert len(history) >= 1
    assert "WHATSAPP" in history[0]["channel"]


def test_diaspora_desk_inquiry_and_lead_scoring():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    inq = crm.create_inquiry(
        customer_name="Ruvimbo Mutasa",
        phone="+1 214 555 0199",
        email="ruvimbo.mutasa@dallastech.com",
        source_channel="DIASPORA_DESK",
        property_interest="Parkview Heights Commercial Suite",
        budget_usd=95000.0,
        notes="US Diaspora investor seeking high-yield commercial assets.",
        assigned_agent="Chipo Marufu",
        urgency="Immediate",
        is_diaspora=True,
        diaspora_country="United States",
    )

    assert inq.is_diaspora is True
    assert inq.diaspora_country == "United States"

    cust = crm.find_customer_by_phone_or_email(inq.phone, inq.email)
    assert cust is not None
    assert cust.is_diaspora is True
    # Diaspora with complete contact and > $50k budget should score 100
    assert cust.lead_score == 100


def test_inquiry_filtering():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    all_inqs = crm.get_inquiries()
    assert len(all_inqs) >= 4

    whatsapp_inqs = crm.get_inquiries(source_channel="WHATSAPP_BOT")
    for item in whatsapp_inqs:
        assert item["source_channel"] == "WHATSAPP_BOT"

    diaspora_inqs = crm.get_inquiries(is_diaspora=True)
    assert len(diaspora_inqs) >= 1
    for item in diaspora_inqs:
        assert item["is_diaspora"] is True


def test_client_communication_history_tracking():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    # Log phone call
    comm1 = crm.log_communication(
        customer_id_or_name="Farai Chengeta",
        inquiry_or_deal_ref="DEAL-1001",
        channel="PHONE_CALL",
        direction="OUTBOUND",
        agent_name="Tapiwa Zhou",
        summary="Followed up regarding site visit feedback.",
        client_sentiment="Positive",
        follow_up_action="Draft formal Agreement of Sale",
        follow_up_date="2026-10-12",
    )
    assert comm1.comm_id.startswith("COMM-")
    assert comm1.client_sentiment == "Positive"
    assert comm1.direction == "OUTBOUND"

    # Retrieve history for Farai Chengeta
    history = crm.get_communication_history(customer_id_or_name="Farai Chengeta")
    assert len(history) >= 4  # seeded + new one
    assert history[0]["summary"] == "Followed up regarding site visit feedback."

    # Retrieve history by deal ref
    deal_history = crm.get_communication_history(inquiry_or_deal_ref="DEAL-1001")
    assert len(deal_history) >= 3


def test_sales_pipeline_and_deal_lifecycle():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    # 1. Create new deal at initial stage
    deal = crm.create_deal(
        title="Kadoma Stand 105 - Residential Development",
        customer_name="Tatenda Mabika",
        stand_or_property_id="STAND-KAD-105",
        deal_value_usd=15000.0,
        payment_terms="24 Months Amortized",
        assigned_agent="Blessing Hove",
        initial_stage="1_INQUIRY_CAPTURED",
        expected_close_days=45,
    )

    assert deal.deal_id.startswith("DEAL-")
    assert deal.stage == "1_INQUIRY_CAPTURED"
    assert deal.probability_pct == 10
    assert deal.deal_value_usd == 15000.0
    assert deal.deal_value_zwg == round(15000.0 * 26.50, 2)

    # 2. Advance stage to Site Visit Scheduled
    updated_deal = crm.advance_deal_stage(
        deal_id=deal.deal_id,
        new_stage="3_SITE_VISIT_SCHEDULED",
        notes="Physical site inspection scheduled for Saturday.",
    )
    assert updated_deal.stage == "3_SITE_VISIT_SCHEDULED"
    assert updated_deal.probability_pct == 45

    # 3. Advance stage to Reservation Deposit
    updated_deal = crm.advance_deal_stage(
        deal_id=deal.deal_id,
        new_stage="6_RESERVATION_DEPOSIT",
        notes="Deposit paid via EcoCash merchant transfer.",
    )
    assert updated_deal.stage == "6_RESERVATION_DEPOSIT"
    assert updated_deal.probability_pct == 90

    # 4. Advance to Closed Won
    won_deal = crm.advance_deal_stage(
        deal_id=deal.deal_id,
        new_stage="8_CLOSED_WON",
        notes="Agreement of sale signed under Deeds Registries Act.",
    )
    assert won_deal.stage == "8_CLOSED_WON"
    assert won_deal.probability_pct == 100

    # 5. Invalid stage raises error
    with pytest.raises(ValueError) as exc:
        crm.advance_deal_stage(deal.deal_id, "NON_EXISTENT_STAGE")
    assert "Invalid pipeline stage" in str(exc.value)


def test_pipeline_summary_and_conversion_metrics():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    summary = crm.get_pipeline_summary()

    assert summary["total_deals_count"] >= 5
    assert summary["active_pipeline_deals_count"] >= 4
    assert summary["total_pipeline_value_usd"] > 200000.0
    assert summary["weighted_pipeline_value_usd"] > 100000.0
    assert summary["closed_won_value_usd"] >= 48000.0
    assert summary["currency_rate_zwg"] == 26.50

    # Stage breakdown integrity
    for stage_name in PIPELINE_STAGES:
        assert stage_name in summary["stage_breakdown"]
        stg = summary["stage_breakdown"][stage_name]
        assert "count" in stg
        assert "total_value_usd" in stg
        assert "weighted_value_usd" in stg
        assert "probability_pct" in stg


def test_customer_360_degree_view():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    c360 = crm.get_customer_360("CRM-CUST-101")
    assert "error" not in c360
    assert c360["customer_profile"]["full_name"] == "Farai Chengeta"
    assert len(c360["deals"]) >= 2
    assert len(c360["inquiries"]) >= 1
    assert len(c360["communication_timeline"]) >= 3
    assert c360["lifetime_settled_value_usd"] == 48000.0


def test_digital_channels_and_cx_metrics():
    crm = SalesCRMPipelineManager(rbz_zwg_rate=26.50)

    metrics = crm.get_digital_channels_and_cx_metrics()
    assert metrics["total_inquiries"] >= 4
    assert metrics["digital_response_sla_minutes"] <= 5.0
    assert metrics["overall_conversion_rate_pct"] > 0

    cx = metrics["customer_experience"]
    assert 4.0 <= cx["csat_score_out_of_5"] <= 5.0
    assert cx["nps_net_promoter_score"] >= 70
    assert cx["first_contact_resolution_rate_pct"] > 80.0

    channels = metrics["omnichannel_breakdown"]
    assert "WHATSAPP_BOT" in channels
    assert "WEBSITE_PORTAL" in channels
    assert "DIASPORA_DESK" in channels
    assert "ECOCASH_DIGITAL" in channels
