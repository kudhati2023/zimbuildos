"""
Pydantic v2 validation DTOs for Real Estate & Building Construction ERP Suite.
Provides rigorous input/output validation across all 10 ERP modules.
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, EmailStr, field_validator


# ============================================================================
# MODULE 1: LAND DEVELOPER (Pro-Forma & RLV)
# ============================================================================
class ParcelCreateDTO(BaseModel):
    project_id: str
    parcel_id: str
    title_deed_ref: Optional[str] = None
    zoning_type: str
    legal_status: str = "Clean Title"
    acquisition_type: Literal["Outright", "Joint Venture", "Joint Development"] = "Outright"
    boundary_geojson: Dict[str, Any]
    gross_area_sqm: float = Field(gt=0)


class ProFormaRequestDTO(BaseModel):
    gross_realization_value: float = Field(gt=0, description="Total projected revenue / GDV / GRV")
    hard_costs: float = Field(gt=0, description="Direct construction costs")
    soft_costs: float = Field(ge=0, description="Permits, architectural, engineering, statutory fees")
    finance_costs: float = Field(ge=0, description="Interest during construction and bank debt facility fees")
    target_developer_margin_pct: float = Field(ge=0, le=100, description="Target margin on GRV or Cost (e.g. 20%)")
    margin_basis: Literal["ON_GRV", "ON_COST"] = "ON_GRV"
    project_duration_months: int = Field(default=24, ge=1)
    equity_contribution_pct: float = Field(default=30.0, ge=0, le=100)
    debt_interest_rate_pct: float = Field(default=10.0, ge=0)
    discount_rate_pct: float = Field(default=12.0, ge=0)
    annual_net_operating_income: float = Field(default=0.0, ge=0)
    annual_debt_service: float = Field(default=0.0, ge=0)


class RlvCalculationResponseDTO(BaseModel):
    gross_realization_value: float
    total_construction_hard_soft: float
    finance_costs: float
    target_developer_margin_usd: float
    residual_land_value: float
    unlevered_irr_pct: float
    levered_irr_pct: float
    npv_usd: float
    dscr: float


class SensitivityStressTestDTO(BaseModel):
    base_request: ProFormaRequestDTO
    cost_variation_pcts: List[float] = [-10.0, 0.0, 10.0]
    lease_up_speed_factors: List[float] = [0.8, 1.0, 1.2]
    exit_cap_rates: List[float] = [0.07, 0.08, 0.09]


# ============================================================================
# MODULE 2: LAND SURVEYOR (GIS, CAD & FIELD-TO-OFFICE)
# ============================================================================
class CoordinateConversionRequestDTO(BaseModel):
    wgs84_latitude: float = Field(ge=-90, le=90)
    wgs84_longitude: float = Field(ge=-180, le=180)
    target_epsg: int = Field(default=32736, description="Target EPSG (e.g. UTM Zone 36S)")


class CoordinateConversionResponseDTO(BaseModel):
    wgs84_lat: float
    wgs84_lon: float
    target_epsg: int
    projected_easting_x: float
    projected_northing_y: float


class SpatialIngestionDTO(BaseModel):
    project_id: str
    file_type: Literal["GEOJSON", "DXF", "SHAPEFILE"]
    raw_content: str
    layer_name: Optional[str] = "BOUNDARY"


class LotSubdivisionRequestDTO(BaseModel):
    parent_polygon_geojson: Dict[str, Any]
    target_lot_count: int = Field(ge=2, le=500)
    setback_buffer_meters: float = Field(default=3.0, ge=0)
    easement_width_meters: float = Field(default=6.0, ge=0)


# ============================================================================
# MODULE 3: CIVIL & DESIGN (BOQ & TQM QUALITY INSPECTIONS)
# ============================================================================
class BoqItemCreateDTO(BaseModel):
    project_id: str
    cost_code: str
    wbs_element: str
    description: str
    unit_of_measure: str
    budgeted_quantity: float = Field(gt=0)
    budgeted_unit_rate: float = Field(gt=0)


class BoqCsvImportDTO(BaseModel):
    project_id: str
    csv_content: str


class TqmSiteInspectionCreateDTO(BaseModel):
    project_id: str
    inspector_id: str
    location_description: str
    inspection_stage: str
    defect_severity: Literal["MINOR", "MODERATE", "CRITICAL", "FATAL"] = "MINOR"
    defect_description: Optional[str] = None
    photo_urls: List[str] = []
    corrective_action_assigned_to: Optional[str] = None


class TqmResolveInspectionDTO(BaseModel):
    inspection_id: str
    resolved_by_id: str
    resolution_notes: str


# ============================================================================
# MODULE 4: LAND SALES AGENT (INVENTORY & COMMISSIONS)
# ============================================================================
class UnitCreateDTO(BaseModel):
    parcel_id: str
    unit_number: str
    block_phase: Optional[str] = None
    lot_area_sqm: float = Field(gt=0)
    list_price_usd: float = Field(gt=0)
    footprint_geojson: Optional[Dict[str, Any]] = None


class UnitStateTransitionDTO(BaseModel):
    unit_id: str
    target_status: Literal["Available", "Reserved", "Booked", "Sold", "Blocked"]
    user_id: str
    expected_version: int
    reservation_hours: Optional[int] = 48


class CommissionCalculationDTO(BaseModel):
    unit_price_usd: float = Field(gt=0)
    tier_level: int = Field(default=1, ge=1, le=5)
    downpayment_received_pct: float = Field(ge=0, le=100)
    trigger_milestone_pct: float = Field(default=20.0, ge=0, le=100)


# ============================================================================
# MODULE 5: PROJECT MANAGER (EVM, AIA BILLING & CHANGE ORDERS)
# ============================================================================
class EvmMetricsDTO(BaseModel):
    planned_value_pv: float = Field(ge=0)
    earned_value_ev: float = Field(ge=0)
    actual_cost_ac: float = Field(ge=0)


class EvmCalculationResponseDTO(BaseModel):
    schedule_variance_sv: float
    cost_variance_cv: float
    schedule_performance_index_spi: float
    cost_performance_index_cpi: float
    status: Literal["ON_TRACK", "AT_RISK", "CRITICAL_ALERT"]


class AiaG702BillingDTO(BaseModel):
    project_id: str
    application_number: int = Field(ge=1)
    period_to: date
    contract_sum_to_date: float = Field(gt=0)
    total_completed_and_stored: float = Field(ge=0)
    retainage_percentage: float = Field(default=10.0, ge=0, le=30)
    previous_certificates_usd: float = Field(default=0.0, ge=0)
    lien_waiver_received: bool = False


class ChangeOrderCreateDTO(BaseModel):
    project_id: str
    pci_code: str
    title: str
    description: Optional[str] = None
    cost_impact_usd: float
    schedule_impact_days: int = 0
    available_contingency_reserve: float = Field(ge=0)


# ============================================================================
# MODULE 6: EXECUTIVE MANAGEMENT (BI & PREDICTIVE RISK)
# ============================================================================
class PortfolioProjectSummaryDTO(BaseModel):
    project_id: str
    project_name: str
    net_operating_income: float
    sales_velocity_units_per_month: float
    budget_vs_actual_variance_usd: float
    schedule_delay_days: int
    spi: float
    cpi: float
    statutory_deadline_approaching: bool = False


class PredictiveRiskEvaluationDTO(BaseModel):
    project_id: str
    spi: float
    cpi: float
    statutory_deadline_days_remaining: int
    is_risk_flagged: bool
    risk_factors: List[str]


# ============================================================================
# MODULE 7: FINANCE & ACCOUNTING (MULTI-CURRENCY & CAM)
# ============================================================================
class MultiCurrencyFxConversionDTO(BaseModel):
    amount: float = Field(gt=0)
    source_currency: str = Field(min_length=3, max_length=3)
    target_currency: str = Field(min_length=3, max_length=3)
    spot_exchange_rate: float = Field(gt=0)
    book_exchange_rate: float = Field(gt=0)


class CamReconciliationDTO(BaseModel):
    total_building_cam_expenses_usd: float = Field(gt=0)
    building_total_rentable_sqft: float = Field(gt=0)
    tenants: List[Dict[str, Any]]  # [{"tenant_id": "T1", "leased_sqft": 5000.0, "paid_prepayments_usd": 12000.0}]


# ============================================================================
# MODULE 8: MARKETING (LEAD ATTRIBUTION & CAMPAIGN)
# ============================================================================
class LeadWebhookDTO(BaseModel):
    lead_source: str
    campaign_name: str
    contact_name: str
    contact_email: EmailStr
    contact_phone: str
    budget_usd: Optional[float] = None
    preferred_zoning: Optional[str] = None


class CampaignPerformanceDTO(BaseModel):
    campaign_id: str
    channel_name: str
    total_marketing_spend_usd: float = Field(gt=0)
    total_leads_acquired: int = Field(ge=0)
    total_deals_closed: int = Field(ge=0)
    gross_revenue_closed_usd: float = Field(ge=0)


# ============================================================================
# MODULE 9: HR & PAYROLL
# ============================================================================
class MobileGeofencedCheckInDTO(BaseModel):
    worker_id: str
    project_id: str
    cost_code_id: str
    check_in_time: datetime
    check_out_time: datetime
    check_in_lat: float
    check_in_lon: float
    site_centroid_lat: float
    site_centroid_lon: float
    geofence_radius_meters: float = 200.0
    worker_cert_expiry_date: date


class SiteWorkerPayrollDTO(BaseModel):
    worker_id: str
    standard_hours: float = Field(ge=0)
    overtime_hours: float = Field(default=0, ge=0)
    base_hourly_rate_usd: float = Field(gt=0)
    overtime_multiplier: float = Field(default=1.5, ge=1.0)
    tax_withholding_pct: float = Field(default=15.0, ge=0, le=60)
    statutory_levy_pct: float = Field(default=3.0, ge=0, le=20)


# ============================================================================
# MODULE 10: OPERATIONS (3-WAY MATCH & PLANT ASSET)
# ============================================================================
class ThreeWayMatchVerificationDTO(BaseModel):
    po_number: str
    po_quantity: float = Field(gt=0)
    po_unit_price_usd: float = Field(gt=0)
    po_total_usd: float = Field(gt=0)
    delivery_note_number: str
    delivered_quantity: float = Field(gt=0)
    delivery_gps_lat: float
    delivery_gps_lon: float
    site_expected_lat: float
    site_expected_lon: float
    vendor_invoice_number: str
    invoiced_quantity: float = Field(gt=0)
    invoiced_unit_price_usd: float = Field(gt=0)
    invoiced_total_usd: float = Field(gt=0)


class PlantAssetUsageDTO(BaseModel):
    asset_tag: str
    hours_worked: float = Field(ge=0)
    fuel_liters_consumed: float = Field(ge=0)
    hourly_hire_rate_usd: float = Field(gt=0)
    current_odometer_hours: float = Field(ge=0)
    preventive_maintenance_threshold_hours: float = Field(gt=0)
