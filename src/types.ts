// ============================================================================
// ZimBuild Housing Management System (ZHMS)
// Shared domain types — these mirror the zhms-api responses exactly.
// ============================================================================

export type QuotaCategory = 'GENERAL' | 'YOUTH' | 'WOMEN' | 'DISABILITY' | 'VETERAN' | 'PUBLIC_SERVANT';
export type ZoningType = 'SINGLE_RESIDENTIAL' | 'HIGH_RISE_FLAT' | 'COMMERCIAL' | 'MSME_WORKSPACE';
export type LandConstraint = 'WETLAND' | 'POWER_WAYLEAVE' | 'ROAD_SERVITUDE' | 'FLOOD_ZONE';
export type ServicingState = 'PENDING' | 'IN_PROGRESS' | 'CERTIFIED';
export type PaymentChannel = 'ECOCASH' | 'BANK_TRANSFER' | 'OMARI' | 'DEBIT_ORDER' | 'CASH';
export type Currency = 'USD' | 'ZWG';

/** Map colour state, derived by the server from the cadastre status. */
export type StandMapStatus = 'available' | 'pending_deposit' | 'allocated' | 'blocked' | 'disputed';

export interface StandServicing {
  water: ServicingState;
  sewer: ServicingState;
  roads: ServicingState;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** One stand as shown on the map (properties of a GIS feature). */
export interface GISStand {
  id: string;
  parcel_id: string;
  stand_number: string;
  development_id: string;
  scheme_name: string;
  area_sqm: number;
  price_usd: number;
  required_deposit_usd: number;
  balance_usd: number;
  status: StandMapStatus;
  cadastre_status: 'AVAILABLE' | 'RESERVED' | 'ALLOCATED' | 'DISPUTED' | 'WITHDRAWN';
  land_constraint: LandConstraint | null;
  zoning_type: ZoningType;
  quota_category: QuotaCategory;
  servicing: StandServicing;
  fully_serviced: boolean;
  servicing_certificate_ref: string | null;
  surveyor_general_ref: string | null;
  dimensions: string | null;
  center_point: [number, number] | null; // [lat, lng]
  allocation_id: string | null;
  allocation_status: string | null;
  allocated_on: string | null;
  title_deed_issued: boolean;
  holder_name: string | null;          // staff only
  holder_national_id: string | null;   // staff only
  geometry: GeoJSONPolygon | null;
  boundary_traverse?: BoundaryTraverseLeg[];
}

export interface BoundaryTraverseLeg {
  leg: string;
  from: [number, number];
  to: [number, number];
  distance_meters: number;
  bearing_degrees: number;
  bearing_formatted: string;
}

export interface UtilityFeatureCollection {
  type: 'FeatureCollection';
  development_id: string;
  features: {
    type: 'Feature';
    properties: {
      utility?: 'WATER_MAIN' | 'SEWER_TRUNK' | 'POWER_11KV';
      utility_type?: string;
      name?: string;
      status?: string;
      pressure_bar?: number;
      diameter_mm?: number;
      pipe_dia_mm?: number;
      voltage_kv?: number;
      material?: string;
      gradient_percent?: number;
      stand_number?: string;
      water?: ServicingState;
      sewer?: ServicingState;
      roads?: ServicingState;
    };
    geometry: {
      type: 'LineString';
      coordinates: number[][];
    };
  }[];
}

export interface SGScheduleParseResult {
  beacons: Array<{
    beacon: string;
    x: number;
    y: number;
  }>;
  geometry: GeoJSONPolygon;
  shape: {
    centroid: { lat: number; lng: number };
    areaSqm: number;
    dimensions: string;
  };
  traverse: BoundaryTraverseLeg[];
  beacon_count: number;
}

export interface StandFeatureCollection {
  type: 'FeatureCollection';
  features: { type: 'Feature'; id: string; geometry: GeoJSONPolygon | null; properties: Omit<GISStand, 'geometry'> }[];
}

export interface HousingDevelopment {
  id: string;
  name: string;
  code: string;
  province: string;
  target_units: number;
  stands_recorded: number;
  center: [number, number]; // [lat, lng]
  zoom: number;
}

/** Row from GET /spatial/stands (cadastre table). */
export interface CadastreStand {
  parcel_id: string;
  stand_number: string;
  scheme_name: string;
  site_location: string;
  area_sqm: string;
  price_usd: string;
  status: string;
  quota_category: QuotaCategory;
}

export interface Application {
  application_id: string;
  status: string;
  round: number;
  quota_category: QuotaCategory;
  registration_channel: string;
  preferred_scheme: string | null;
  first_submitted_at: string;
  first_name: string;
  last_name: string;
  national_id: string;
  phone_number: string;
}

export interface ApplicationInput {
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  physicalAddress: string;
  preferredScheme?: string;
  quotaCategory: QuotaCategory;
  registrationChannel: 'WEB' | 'MOBILE' | 'STAFF';
  preferredChannel: 'WHATSAPP' | 'SMS';
}

export interface Allocation {
  allocation_id: string;
  application_id: string;
  parcel_id: string;
  status: string;
  account_ref: string;
  total_price_usd: string;
  deposit_required_usd: string;
  reservation_expires_at: string;
  stand_number?: string;
  scheme_name?: string;
  site_location?: string;
  area_sqm?: string;
  paid_usd?: string;
  balance_usd?: string;
  first_name?: string;
  last_name?: string;
  national_id?: string;
}

export interface PaymentRow {
  payment_id: string;
  channel: PaymentChannel;
  amount_usd: string;
  currency: Currency;
  amount_original: string | null;
  fx_rate: string | null;
  external_reference: string;
  receipt_number: string;
  received_at: string;
}

export interface Instalment {
  installment_id: string;
  seq: number;
  due_date: string;
  principal_usd: string;
  interest_usd: string;
  paid_usd: string;
  status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
}

export interface Statement {
  allocation: Allocation & { user_sub: string | null; phone_number: string; physical_address: string };
  payments: PaymentRow[];
  paymentPlan: null | {
    plan_id: string;
    term_months: number;
    monthly_rate_bps: number;
    effective_annual_rate: string;
    installments: Instalment[];
    outstandingUsd: string;
    overdueUsd: string;
    nextInstalment: null | { seq: number; dueDate: string; amountUsd: string };
  };
}

export interface PaymentResult {
  receiptNumber: string;
  newStatus: string;
  outstandingUsd: number;
}

export interface IssuedDocument {
  documentNumber: string;
  docType: string;
  verificationToken: string;
  status: string;
}

export interface Session {
  token: string;
  sub: string;
  roles: string[];
  expiresAt: number | null; // ms since epoch
}

// ============================================================================ construction operations
// Money fields from list endpoints are PostgreSQL numeric strings ("1234.50"); report endpoints return numbers.

export type CostCategory = 'MATERIAL' | 'LABOUR' | 'EQUIPMENT' | 'SUBCONTRACT' | 'OVERHEAD';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED';
export type Weather = 'SUNNY' | 'CLOUDY' | 'RAIN' | 'HEAVY_RAIN' | 'WINDY' | 'STORM';
export type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE' | 'BREAKDOWN' | 'INSPECTION';

export interface ConstructionProject {
  project_id: string;
  code: string;
  name: string;
  development_id: string | null;
  site_location: string;
  client_name: string;
  contract_value_usd: string;
  start_date: string;
  planned_end_date: string;
  status: ProjectStatus;
  created_by: string;
  created_at: string;
  // portfolio list only
  budget_usd?: string;
  actual_usd?: string;
  percent_complete?: number;
  open_ncrs?: number;
  claims_awaiting_certification?: number;
  last_site_report?: string | null;
}

export interface Material {
  material_code: string;
  name: string;
  unit: string;
  standard_rate_usd: string;
}

export interface BudgetLine {
  line_id: string;
  project_id: string;
  cost_code: string;
  description: string;
  category: CostCategory;
  original_budget_usd: string;
  budget_quantity: string | null;
  unit: string | null;
  adjustments_usd: string;
  revised_budget_usd: string;
  adjustments: { amount_usd: string; reason: string; approved_by: string; created_at: string }[];
}

export interface CostEntry {
  entry_id: string;
  line_id: string;
  cost_code: string;
  category: CostCategory;
  source: 'MATERIAL_ISSUE' | 'LABOUR_TIMESHEET' | 'EQUIPMENT_USAGE' | 'SUBCONTRACT_CERTIFICATE' | 'OVERHEAD' | 'REVERSAL';
  entry_date: string;
  description: string;
  quantity: string;
  unit: string;
  unit_rate_usd: string;
  amount_usd: string;
  material_name: string | null;
  asset_tag: string | null;
  worker_ref: string | null;
  reversal_of: string | null;
  reversed: boolean;
  recorded_by: string;
}

export interface JobCostLine {
  line_id: string;
  cost_code: string;
  description: string;
  category: CostCategory;
  original_budget_usd: number;
  adjustments_usd: number;
  revised_budget_usd: number;
  actual_usd: number;
  committed_usd: number;
  open_commitment_usd: number;
  forecast_final_usd: number;
  variance_usd: number;
  consumed_percent: number | null;
  unit: string | null;
  budget_quantity: number | null;
  actual_quantity: number | null;
  quantity_variance: number | null;
  status: 'WITHIN_BUDGET' | 'AT_RISK' | 'OVER_BUDGET';
}

export interface JobCostReport {
  project: ConstructionProject;
  asOf: string;
  totals: {
    revised_budget_usd: number; actual_usd: number; open_commitment_usd: number; forecast_final_usd: number;
    variance_usd: number; contract_value_usd: number; projected_margin_usd: number | null;
  };
  earnedValue: {
    percentComplete: number; plannedPercent: number; scheduleStatus: string;
    bac_usd: number; pv_usd: number; ev_usd: number; ac_usd: number;
    cpi: number | null; spi: number | null; eac_usd: number; vac_usd: number;
  };
  alerts: { cost_code: string; description: string; status: string; consumed_percent: number | null; variance_usd: number }[];
  byCategory: { category: CostCategory; lines: number; revised_budget_usd: number; actual_usd: number; open_commitment_usd: number;
    forecast_final_usd: number; variance_usd: number; consumed_percent: number | null }[];
  lines: JobCostLine[];
  monthly: { month: string; category: CostCategory; amount_usd: number }[];
  materialConsumption: { material_code: string; name: string; unit: string; quantity: number; amount_usd: number }[];
  equipmentUsage: { equipment_id: string; asset_tag: string; name: string; hours: number; amount_usd: number }[];
  labour: { unit: string; workers: number; quantity: number; amount_usd: number }[];
}

export interface Milestone {
  milestone_id: string;
  seq: number;
  name: string;
  weight_percent: string;
  planned_start: string;
  planned_finish: string;
  percent_complete: string;
  actual_start: string | null;
  actual_finish: string | null;
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'LATE' | 'LATE_START';
  planned_percent: number;
}

export interface ProgressSummary {
  percentComplete: number;
  plannedPercent: number;
  scheduleVariance: number;
  status: 'NO_SCHEDULE' | 'ON_TRACK' | 'AHEAD' | 'BEHIND' | 'COMPLETE';
  weightAssigned: number;
}

export interface ProjectProgress {
  asOf: string;
  summary: ProgressSummary;
  milestones: Milestone[];
  curve: { date: string; planned: number; actual: number; workers: number }[];
  diary: {
    daysReported: number; lostHours: number; safetyIncidents: number; workerDays: number; wetDays: number;
    averageWorkers: number; lastReportDate: string | null; daysSinceLastReport: number | null;
  };
}

export interface DailyReport {
  report_id: string;
  report_date: string;
  weather: Weather;
  workers_on_site: number;
  work_performed: string;
  delays: string | null;
  lost_hours: string;
  safety_incidents: number;
  safety_notes: string | null;
  submitted_by: string;
  progress: { milestone_id: string; name: string; percent_before: number; percent_after: number; note: string | null }[];
}

export interface Subcontractor {
  subcontractor_id: string;
  name: string;
  registration_no: string;
  trade: string;
  contact_phone: string;
  email: string | null;
  tax_clearance_expiry: string | null;
  tax_clearance_valid: boolean;
  user_sub: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  active_subcontracts: number;
}

export interface Tender {
  tender_id: string;
  reference: string;
  project_id: string;
  line_id: string;
  title: string;
  scope: string;
  estimate_usd?: string;
  price_weight: number;
  technical_weight: number;
  min_technical_score: string;
  closing_at: string;
  status: 'OPEN' | 'EVALUATION' | 'AWARDED' | 'CANCELLED';
  awarded_bid_id: string | null;
  award_justification: string | null;
  cancel_reason: string | null;
  project_code?: string;
  project_name?: string;
  cost_code?: string;
  bid_count?: number;
  my_bid?: boolean;
}

export interface TenderBid {
  bid_id: string;
  subcontractor_id: string;
  subcontractor_name: string;
  tax_clearance_expiry: string | null;
  amount_usd: string | null;
  duration_days: number | null;
  methodology: string | null;
  technical_score?: string | null;
  submitted_at: string;
}

export interface EvaluatedBid extends TenderBid {
  compliant: boolean;
  price_score: number | null;
  combined_score: number | null;
  rank: number | null;
  non_compliance: string[];
}

export interface TenderDetail {
  tender: Tender;
  sealed?: boolean;
  bids: TenderBid[];
  evaluation: { complete: boolean; lowestCompliantUsd: number | null; recommendedBidId: string | null; bids: EvaluatedBid[] } | null;
}

export interface Subcontract {
  subcontract_id: string;
  contract_no: string;
  project_id: string;
  subcontractor_id: string;
  subcontractor_name: string;
  project_code: string;
  project_name: string;
  cost_code: string;
  scope: string;
  original_value_usd: string;
  retention_percent: string;
  payment_terms_days: number;
  defects_liability_months: number;
  start_date: string;
  end_date: string;
  status: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
  revised_value_usd?: string;
  certified_to_date_usd?: string;
  retention_held_usd?: string;
  paid_to_date_usd?: string;
  claims_awaiting_certification?: number;
}

export interface SubcontractClaim {
  claim_id: string;
  claim_no: number;
  period_end: string;
  claimed_cumulative_usd: string;
  status: 'SUBMITTED' | 'CERTIFIED' | 'REJECTED' | 'PAID';
  submitted_by: string;
  certified_cumulative_usd: string | null;
  gross_this_period_usd: string | null;
  retention_this_period_usd: string | null;
  net_payable_usd: string | null;
  payment_due_date: string | null;
  certified_by: string | null;
  rejection_reason: string | null;
  paid_reference: string | null;
  overdue: boolean;
}

export interface SubcontractDetail {
  subcontract: Subcontract;
  variations: { variation_id: string; amount_usd: string; reason: string; approved_by: string; created_at: string }[];
  claims: SubcontractClaim[];
  totals: {
    original_value_usd: number; variations_usd: number; revised_value_usd: number; certified_to_date_usd: number;
    remaining_value_usd: number; retention_held_usd: number; paid_to_date_usd: number; certified_unpaid_usd: number;
    percent_certified: number;
  };
}

export interface ChecklistItem {
  item: string;
  passed: boolean;
  note?: string | null;
  severity?: Severity | null;
}

export interface Inspection {
  inspection_id: string;
  milestone_id: string | null;
  milestone_name: string | null;
  inspection_type: string;
  location: string;
  inspected_on: string;
  checklist: ChecklistItem[];
  result: 'PASS' | 'FAIL';
  notes: string | null;
  inspector: string;
  ncr_count: number;
}

export interface NonConformance {
  ncr_id: string;
  ncr_no: string;
  milestone_id: string | null;
  milestone_name: string | null;
  description: string;
  severity: Severity;
  status: 'OPEN' | 'RESOLVED' | 'CLOSED';
  due_date: string;
  raised_by: string;
  corrective_action: string | null;
  resolved_by: string | null;
  verification_note: string | null;
  closed_by: string | null;
  overdue: boolean;
}

export interface QualitySummary {
  inspections: number;
  passed: number;
  open: number;
  awaiting_verification: number;
  closed: number;
  open_critical: number;
  overdue: number;
  first_time_pass_rate: number | null;
  avg_days_to_close: number | null;
}

export interface MaintenanceLog {
  log_id: string;
  equipment_id: string;
  maintenance_type: MaintenanceType;
  status: 'OPEN' | 'COMPLETED';
  description: string;
  takes_out_of_use: boolean;
  reported_by: string;
  reported_at: string;
  work_done: string | null;
  hour_meter_reading: string | null;
  parts_cost_usd: string | null;
  labour_cost_usd: string | null;
  downtime_hours: string | null;
  completed_by: string | null;
  completed_at: string | null;
  project_code?: string | null;
}

export interface Equipment {
  equipment_id: string;
  asset_tag: string;
  name: string;
  equipment_type: string;
  hourly_rate_usd: string;
  hour_meter: string;
  service_interval_hours: string;
  last_service_hours: string;
  status: 'AVAILABLE' | 'UNDER_MAINTENANCE' | 'OUT_OF_SERVICE';
  hours_since_service: number;
  hours_to_next_service: number;
  service_due: boolean;
  service_due_soon: boolean;
  open_job: MaintenanceLog | null;
}

export interface FleetSummary {
  windowDays: number;
  equipment: {
    equipment_id: string; asset_tag: string; name: string; status: Equipment['status'];
    breakdowns: number; downtime_hours: number; maintenance_cost_usd: number; hours_worked: number;
    availability_percent: number; mean_hours_between_breakdowns: number | null; service_due: boolean;
  }[];
}

// ---------------------------------------------------------------------------- Sales, Customer Experience & CRM Pipeline
export interface RealEstateInquiry {
  inquiry_id: string;
  customer_name: string;
  phone: string;
  email: string;
  source_channel: string;
  property_interest: string;
  budget_usd: number;
  budget_zwg: number;
  status: string;
  assigned_agent: string;
  notes: string;
  created_at: string;
  urgency: string;
  is_diaspora: boolean;
  diaspora_country?: string | null;
}

export interface CommunicationRecord {
  comm_id: string;
  customer_id_or_name: string;
  inquiry_or_deal_ref: string;
  channel: string;
  direction: string;
  agent_name: string;
  summary: string;
  client_sentiment: string;
  timestamp: string;
  follow_up_action?: string | null;
  follow_up_date?: string | null;
}

export interface SalesDeal {
  deal_id: string;
  title: string;
  customer_id: string;
  customer_name: string;
  stand_or_property_id: string;
  deal_value_usd: number;
  deal_value_zwg: number;
  stage: string;
  probability_pct: number;
  weighted_value_usd: number;
  payment_terms: string;
  assigned_agent: string;
  expected_close_date: string;
  days_in_stage: number;
  closed_reason?: string | null;
  linked_inquiry_id?: string | null;
  created_at: string;
}

export interface PipelineSummary {
  total_deals_count: number;
  active_pipeline_deals_count: number;
  total_pipeline_value_usd: number;
  total_pipeline_value_zwg: number;
  weighted_pipeline_value_usd: number;
  closed_won_value_usd: number;
  currency_rate_zwg: number;
  stage_breakdown: Record<string, {
    count: number;
    total_value_usd: number;
    weighted_value_usd: number;
    probability_pct: number;
  }>;
  stages: Record<string, SalesDeal[]>;
}

export interface DigitalChannelMetrics {
  total_inquiries: number;
  omnichannel_breakdown: Record<string, {
    count: number;
    share_pct: number;
    pipeline_potential_usd: number;
  }>;
  digital_response_sla_minutes: number;
  overall_conversion_rate_pct: number;
  customer_experience: {
    csat_score_out_of_5: number;
    nps_net_promoter_score: number;
    first_contact_resolution_rate_pct: number;
    average_client_interaction_count: number;
  };
}

// ============================================================================
// Supply Chain & Inventory Management Suite Types
// ============================================================================

export interface WMSStockItem {
  item_id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost_usd: number;
  reorder_threshold: number;
  central_store_qty: number;
  site_allocations: Record<string, number>;
  total_stock_on_hand: number;
  total_valuation_usd: number;
  total_valuation_zwg: number;
  is_low_stock: boolean;
  status: 'REORDER_REQUIRED' | 'OPTIMAL_STOCK';
  lead_time_days: number;
  primary_supplier: string;
  lot_numbers: string[];
}

export interface WMSStockTransfer {
  transfer_id: string;
  source_location: string;
  dest_location: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  requested_by: string;
  authorized_by: string;
  dispatched_by: string;
  received_by: string | null;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'RECONCILED';
  timestamp: string;
  lot_number: string | null;
  hmac_signature?: string;
}

export interface SupplyChainVendor {
  vendor_id: string;
  company_name: string;
  tax_number: string;
  contact_person: string;
  phone: string;
  email: string;
  rating: number;
  payment_terms: string;
  compliance_certified: boolean;
}

export interface MaterialRequisitionItem {
  item_id: string;
  item_name: string;
  qty: number;
  unit: string;
  spec?: string;
}

export interface MaterialRequisitionRecord {
  requisition_id: string;
  project_site: string;
  requested_by: string;
  required_date: string;
  items: MaterialRequisitionItem[];
  urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
  status: 'PENDING' | 'APPROVED' | 'PO_ISSUED' | 'REJECTED';
  approved_by: string | null;
  created_at: string;
}

export interface SupplyChainPurchaseOrder {
  po_id: string;
  requisition_id: string;
  vendor_id: string;
  vendor_name: string;
  project_site: string;
  items: Array<{
    item_id: string;
    item_name: string;
    qty: number;
    unit: string;
    unit_price: number;
    line_total: number;
  }>;
  total_amount_usd: number;
  total_amount_zwg: number;
  status: 'ISSUED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'MATCHED' | 'CANCELLED';
  delivered_qty: number;
  grn_reference: string | null;
  photo_evidence_hash: string | null;
  authorized_by: string;
  issued_date: string;
}

export interface ThreeWayMatchResult {
  success: boolean;
  invoice_id: string;
  po_id: string;
  three_way_match: 'MATCHED' | 'VARIANCE_FLAGGED' | 'REJECTED_NO_DELIVERY_PROOF';
  po_amount_usd: number;
  billed_amount_usd: number;
  variance_usd: number;
  vat_15_pct_usd: number;
  total_payable_usd: number;
  delivery_grn: string;
  photo_hash: string;
  audit_notes: string;
  hmac_signature?: string;
}

export interface BOMComponentRecord {
  raw_material_id: string;
  material_name: string;
  required_quantity: number;
  unit: string;
  unit_cost_usd: number;
  scrap_allowance_pct: number;
  total_cost_usd: number;
}

export interface BillOfMaterialsRecord {
  bom_id: string;
  product_code: string;
  product_name: string;
  revision: string;
  lifecycle_phase: string;
  raw_materials_cost_usd: number;
  direct_labor_cost_usd: number;
  machine_overhead_usd: number;
  unit_production_cost_usd: number;
  unit_production_cost_zwg: number;
  components: BOMComponentRecord[];
}

export interface MRPExplosionResult {
  success: boolean;
  product_code: string;
  product_name: string;
  target_quantity: number;
  bom_revision: string;
  material_requirements: Array<{
    raw_material_id: string;
    material_name: string;
    gross_quantity_needed: number;
    unit: string;
    unit_cost_usd: number;
    estimated_cost_usd: number;
  }>;
  total_material_cost_usd: number;
  total_labor_hours: number;
  total_labor_cost_usd: number;
  total_machine_hours: number;
  total_machine_cost_usd: number;
  grand_total_production_usd: number;
  grand_total_production_zwg: number;
}

export interface ProductionWorkOrderRecord {
  work_order_id: string;
  product_code: string;
  bom_id: string;
  target_quantity: number;
  completed_quantity: number;
  assigned_facility: string;
  start_date: string;
  completion_date?: string | null;
  status: 'PLANNED' | 'IN_ASSEMBLY' | 'QUALITY_INSPECTION' | 'COMPLETED' | 'CANCELLED';
  lead_foreman: string;
  qc_pass_rate_pct: number;
}

export interface EngineeringChangeOrderRecord {
  eco_id: string;
  product_code: string;
  title: string;
  justification: string;
  old_revision: string;
  new_revision: string;
  requested_by: string;
  approved_by?: string | null;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  created_at: string;
}

