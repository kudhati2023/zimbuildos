"""
SQLAlchemy 2.0 ORM Models for Real Estate & Building Construction ERP Suite.
Supports PostgreSQL/PostGIS in production and SQLite in testing/development environments.
"""

from datetime import datetime, timezone
import uuid
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    Numeric,
    Integer,
    ForeignKey,
    Text,
    JSON,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def gen_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="CIVIL_ENGINEER")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    inspections = relationship("TqmSiteInspection", back_populates="inspector")
    commissions = relationship("SalesCommission", back_populates="agent")


class ImmutableAuditLog(Base):
    __tablename__ = "immutable_audit_logs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_name = Column(String(100), nullable=False, index=True)
    entity_id = Column(String(100), nullable=False, index=True)
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False, index=True)


class ErpProject(Base):
    __tablename__ = "erp_projects"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    base_currency = Column(String(3), default="USD", nullable=False)
    planned_value_pv = Column(Numeric(16, 2), default=0.00, nullable=False)
    earned_value_ev = Column(Numeric(16, 2), default=0.00, nullable=False)
    actual_cost_ac = Column(Numeric(16, 2), default=0.00, nullable=False)
    contingency_reserve = Column(Numeric(16, 2), default=0.00, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    parcels = relationship("LandParcel", back_populates="project", cascade="all, delete-orphan")
    cde_documents = relationship("CdeDocument", back_populates="project", cascade="all, delete-orphan")
    cost_codes = relationship("BoqCostCode", back_populates="project", cascade="all, delete-orphan")
    inspections = relationship("TqmSiteInspection", back_populates="project", cascade="all, delete-orphan")
    aia_applications = relationship("AiaPaymentApplication", back_populates="project", cascade="all, delete-orphan")
    change_items = relationship("PotentialChangeItem", back_populates="project", cascade="all, delete-orphan")
    purchase_orders = relationship("PurchaseOrder", back_populates="project", cascade="all, delete-orphan")


class CdeDocument(Base):
    __tablename__ = "cde_documents"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    document_number = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    file_uri = Column(String(1024), nullable=False)
    file_hash_sha256 = Column(String(64), nullable=False)
    cde_state = Column(String(20), default="WIP", nullable=False)  # WIP, Shared, Published, Archived
    revision = Column(String(20), default="P01.01", nullable=False)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="cde_documents")

    __table_args__ = (
        UniqueConstraint("project_id", "document_number", "revision", name="uq_cde_proj_doc_rev"),
    )


class LandParcel(Base):
    __tablename__ = "land_parcels"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    parcel_id = Column(String(100), unique=True, nullable=False, index=True)
    title_deed_ref = Column(String(100), nullable=True)
    zoning_type = Column(String(50), nullable=False)
    legal_status = Column(String(50), default="Clean Title", nullable=False)
    acquisition_type = Column(String(50), default="Outright", nullable=False)
    boundary_geojson = Column(JSON, nullable=False)
    gross_area_sqm = Column(Numeric(12, 2), nullable=False, default=0.00)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="parcels")
    units = relationship("RealEstateUnit", back_populates="parcel", cascade="all, delete-orphan")
    proforma_runs = relationship("ProformaRun", back_populates="parcel", cascade="all, delete-orphan")


class ProformaRun(Base):
    __tablename__ = "proforma_feasibility_runs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    parcel_id = Column(String(36), ForeignKey("land_parcels.id", ondelete="CASCADE"), nullable=False)
    run_label = Column(String(100), nullable=False)
    gross_realization_value = Column(Numeric(16, 2), nullable=False)
    construction_hard_soft_costs = Column(Numeric(16, 2), nullable=False)
    finance_costs = Column(Numeric(16, 2), nullable=False)
    target_developer_margin = Column(Numeric(16, 2), nullable=False)
    residual_land_value = Column(Numeric(16, 2), nullable=False)
    unlevered_irr = Column(Numeric(6, 4), nullable=False)
    levered_irr = Column(Numeric(6, 4), nullable=False)
    npv = Column(Numeric(16, 2), nullable=False)
    min_dscr = Column(Numeric(6, 3), nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    parcel = relationship("LandParcel", back_populates="proforma_runs")


class RealEstateUnit(Base):
    __tablename__ = "real_estate_units"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    parcel_id = Column(String(36), ForeignKey("land_parcels.id", ondelete="CASCADE"), nullable=False)
    unit_number = Column(String(50), nullable=False)
    block_phase = Column(String(50), nullable=True)
    footprint_geojson = Column(JSON, nullable=True)
    lot_area_sqm = Column(Numeric(10, 2), nullable=False)
    list_price_usd = Column(Numeric(14, 2), nullable=False)
    status = Column(String(20), default="Available", nullable=False, index=True)  # Available, Reserved, Booked, Sold, Blocked
    reserved_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reservation_expires_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    parcel = relationship("LandParcel", back_populates="units")
    commissions = relationship("SalesCommission", back_populates="unit", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("parcel_id", "unit_number", name="uq_parcel_unit_num"),
    )


class SalesCommission(Base):
    __tablename__ = "sales_commissions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    unit_id = Column(String(36), ForeignKey("real_estate_units.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tier_level = Column(Integer, default=1, nullable=False)
    commission_rate_pct = Column(Numeric(5, 2), nullable=False)
    commission_amount_usd = Column(Numeric(12, 2), nullable=False)
    trigger_milestone_pct = Column(Numeric(5, 2), default=20.00, nullable=False)
    downpayment_verified_pct = Column(Numeric(5, 2), default=0.00, nullable=False)
    is_authorized = Column(Boolean, default=False, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    unit = relationship("RealEstateUnit", back_populates="commissions")
    agent = relationship("User", back_populates="commissions")


class BoqCostCode(Base):
    __tablename__ = "boq_cost_codes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    cost_code = Column(String(50), nullable=False)
    wbs_element = Column(String(50), nullable=False)
    description = Column(String(255), nullable=False)
    unit_of_measure = Column(String(20), nullable=False)
    budgeted_quantity = Column(Numeric(14, 3), default=0.000, nullable=False)
    budgeted_unit_rate = Column(Numeric(14, 2), default=0.00, nullable=False)
    budgeted_total_usd = Column(Numeric(16, 2), default=0.00, nullable=False)
    actual_quantity = Column(Numeric(14, 3), default=0.000, nullable=False)
    actual_cost_usd = Column(Numeric(16, 2), default=0.00, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="cost_codes")
    purchase_orders = relationship("PurchaseOrder", back_populates="cost_code")

    __table_args__ = (
        UniqueConstraint("project_id", "cost_code", name="uq_proj_cost_code"),
    )


class TqmSiteInspection(Base):
    __tablename__ = "tqm_site_inspections"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    inspector_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    location_description = Column(String(255), nullable=False)
    inspection_stage = Column(String(100), nullable=False)
    defect_severity = Column(String(20), default="MINOR", nullable=False)  # MINOR, MODERATE, CRITICAL, FATAL
    defect_description = Column(Text, nullable=True)
    photo_urls = Column(JSON, default=list, nullable=False)
    is_resolved = Column(Boolean, default=False, nullable=False)
    corrective_action_assigned_to = Column(String(36), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="inspections")
    inspector = relationship("User", back_populates="inspections")


class AiaPaymentApplication(Base):
    __tablename__ = "aia_payment_applications"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    application_number = Column(Integer, nullable=False)
    contractor_id = Column(String(36), nullable=True)
    period_to = Column(DateTime, nullable=False)
    contract_sum_to_date = Column(Numeric(16, 2), nullable=False)
    total_completed_and_stored = Column(Numeric(16, 2), nullable=False)
    retainage_percentage = Column(Numeric(5, 2), default=10.00, nullable=False)
    retainage_withheld_usd = Column(Numeric(16, 2), nullable=False)
    total_earned_less_retainage = Column(Numeric(16, 2), nullable=False)
    previous_certificates_usd = Column(Numeric(16, 2), default=0.00, nullable=False)
    current_payment_due_usd = Column(Numeric(16, 2), nullable=False)
    lien_waiver_received = Column(Boolean, default=False, nullable=False)
    is_certified = Column(Boolean, default=False, nullable=False)
    certified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="aia_applications")

    __table_args__ = (
        UniqueConstraint("project_id", "application_number", name="uq_aia_proj_app_num"),
    )


class PotentialChangeItem(Base):
    __tablename__ = "potential_change_items"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    pci_code = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    cost_impact_usd = Column(Numeric(14, 2), nullable=False)
    schedule_impact_days = Column(Integer, default=0, nullable=False)
    status = Column(String(30), default="DRAFT", nullable=False)  # DRAFT, UNDER_REVIEW, APPROVED, REJECTED
    contingency_reserve_applied = Column(Numeric(14, 2), default=0.00, nullable=False)
    approved_by = Column(String(36), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="change_items")

    __table_args__ = (
        UniqueConstraint("project_id", "pci_code", name="uq_pci_proj_code"),
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    po_number = Column(String(50), unique=True, nullable=False, index=True)
    vendor_name = Column(String(255), nullable=False)
    cost_code_id = Column(String(36), ForeignKey("boq_cost_codes.id", ondelete="SET NULL"), nullable=True)
    ordered_quantity = Column(Numeric(14, 3), nullable=False)
    unit_price_usd = Column(Numeric(14, 2), nullable=False)
    total_amount_usd = Column(Numeric(16, 2), nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    project = relationship("ErpProject", back_populates="purchase_orders")
    cost_code = relationship("BoqCostCode", back_populates="purchase_orders")
    delivery_notes = relationship("SiteDeliveryNote", back_populates="purchase_order", cascade="all, delete-orphan")
    vendor_invoices = relationship("VendorInvoice", back_populates="purchase_order", cascade="all, delete-orphan")


class SiteDeliveryNote(Base):
    __tablename__ = "site_delivery_notes"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    po_id = Column(String(36), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    delivery_note_number = Column(String(50), nullable=False)
    delivered_quantity = Column(Numeric(14, 3), nullable=False)
    photo_evidence_url = Column(String(1024), nullable=False)
    gps_latitude = Column(Numeric(9, 6), nullable=False)
    gps_longitude = Column(Numeric(9, 6), nullable=False)
    received_by = Column(String(36), nullable=True)
    delivery_timestamp = Column(DateTime, default=now_utc, nullable=False)

    purchase_order = relationship("PurchaseOrder", back_populates="delivery_notes")


class VendorInvoice(Base):
    __tablename__ = "vendor_invoices"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    po_id = Column(String(36), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    invoice_number = Column(String(50), nullable=False)
    invoiced_quantity = Column(Numeric(14, 3), nullable=False)
    invoiced_total_usd = Column(Numeric(16, 2), nullable=False)
    match_status = Column(String(50), default="PENDING_MATCH", nullable=False)
    discrepancy_details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=now_utc, nullable=False)

    purchase_order = relationship("PurchaseOrder", back_populates="vendor_invoices")


class PlantEquipmentAsset(Base):
    __tablename__ = "plant_equipment_assets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    asset_tag = Column(String(50), unique=True, nullable=False, index=True)
    equipment_name = Column(String(255), nullable=False)
    current_project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="SET NULL"), nullable=True)
    total_operating_hours = Column(Numeric(10, 2), default=0.00, nullable=False)
    fuel_consumption_liters = Column(Numeric(12, 2), default=0.00, nullable=False)
    hourly_charge_rate_usd = Column(Numeric(10, 2), default=50.00, nullable=False)
    last_preventive_maintenance = Column(DateTime, nullable=True)
    next_maintenance_due_hours = Column(Numeric(10, 2), default=250.00, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)


class SiteWorker(Base):
    __tablename__ = "site_workers"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    national_id = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    trade_classification = Column(String(100), nullable=False)
    hourly_base_rate_usd = Column(Numeric(10, 2), nullable=False)
    license_certification_expiry = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)


class SiteWorkerTimesheet(Base):
    __tablename__ = "site_worker_timesheets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    worker_id = Column(String(36), ForeignKey("site_workers.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(36), ForeignKey("erp_projects.id", ondelete="CASCADE"), nullable=False)
    cost_code_id = Column(String(36), ForeignKey("boq_cost_codes.id", ondelete="CASCADE"), nullable=False)
    check_in_time = Column(DateTime, nullable=False)
    check_out_time = Column(DateTime, nullable=False)
    check_in_lat = Column(Numeric(9, 6), nullable=False)
    check_in_lon = Column(Numeric(9, 6), nullable=False)
    is_geofence_verified = Column(Boolean, default=True, nullable=False)
    standard_hours = Column(Numeric(6, 2), nullable=False)
    overtime_hours = Column(Numeric(6, 2), default=0.00, nullable=False)
    total_pay_usd = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=now_utc, nullable=False)
