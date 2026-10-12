// ============================================================================
// ZimBuild Housing Management System (ZHMS)
// The one API client for zhms-api. There is deliberately NO offline/mock fallback:
// if the server refuses or cannot be reached, the caller gets an ApiError and the
// screen shows it — the UI never pretends a payment or allocation succeeded.
// ============================================================================

import type {
  Allocation, Application, ApplicationInput, CadastreStand, Currency, GISStand, HousingDevelopment,
  IssuedDocument, PaymentChannel, PaymentResult, Session, StandFeatureCollection, StandServicing, Statement,
  RealEstateInquiry, CommunicationRecord, SalesDeal, PipelineSummary, DigitalChannelMetrics
} from './types';
import type {
  BudgetLine, ConstructionProject, CostEntry, DailyReport, Equipment, FleetSummary, Inspection, JobCostReport,
  MaintenanceLog, Material, Milestone, NonConformance, ProjectProgress, ProjectStatus, QualitySummary,
  Subcontract, SubcontractDetail, Subcontractor, Tender, TenderDetail,
} from './types';

export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:5000/api/v1').replace(/\/$/, '');
export const ERP_BASE = (import.meta.env.VITE_ERP_BASE ?? 'http://localhost:8000').replace(/\/$/, '');
const TOKEN_KEY = 'zhms_token';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

// ---------------------------------------------------------------------------- session

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** Decodes (does not verify — the server does that) the signed-in user's token for display and role-based UI. */
export function currentSession(): Session | null {
  const token = readToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    if (expiresAt !== null && expiresAt < Date.now()) return null;
    return { token, sub: String(payload.sub ?? ''), roles: Array.isArray(payload.roles) ? payload.roles : [], expiresAt };
  } catch {
    return null;
  }
}

export function signIn(token: string): Session {
  const t = token.trim();
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked: session lasts for this call only */ }
  const s = currentSession();
  if (!s) {
    signOut();
    throw new ApiError(400, 'INVALID_TOKEN', 'That access token is malformed or has expired');
  }
  return s;
}

export function signOut(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
}

// ---------------------------------------------------------------------------- transport

async function request<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Cannot reach the ZHMS server at ${API_BASE}. Check that zhms-api is running.`);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const fallback = res.status === 401 ? 'Please sign in with a valid access token' : `Request failed (HTTP ${res.status})`;
    throw new ApiError(res.status, data?.error ?? 'HTTP_ERROR', data?.message ?? fallback, data?.details);
  }
  return data as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** True when zhms-api answers its health check (shown in the header instead of a hard-coded "connected"). */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE.replace(/\/api\/v1$/, '')}/healthz`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------- cadastre & GIS

export const fetchStands = (scheme?: string, status?: string) =>
  request<{ stands: CadastreStand[] }>(`/spatial/stands${qs({ scheme, status })}`).then((r) => r.stands);

export const fetchDevelopments = () =>
  request<{ developments: HousingDevelopment[] }>('/gis/developments').then((r) => r.developments);

/** Stands of a development, flattened for the UI (geometry kept alongside the properties). */
export const fetchDevelopmentStands = (developmentId: string) =>
  request<StandFeatureCollection>(`/gis/developments/${encodeURIComponent(developmentId)}/stands`)
    .then((fc): GISStand[] => fc.features.map((f) => ({ ...f.properties, geometry: f.geometry })));

export const importStands = (developmentId: string, featureCollection: unknown) =>
  request<{ importedCount: number }>(`/gis/developments/${encodeURIComponent(developmentId)}/stands/import`, {
    method: 'POST', body: featureCollection,
  });

/** ENGINEER only. Full certification requires the council inspection certificate reference. */
export const updateServicing = (parcelId: string, servicing: Partial<StandServicing>, certificateRef?: string) =>
  request<{ stand: unknown }>(`/stands/${encodeURIComponent(parcelId)}/servicing`, {
    method: 'PUT', body: { ...servicing, certificateRef },
  });

// ---------------------------------------------------------------------------- applications

export const fetchApplications = (status?: string) =>
  request<{ applications: Application[] }>(`/applications${qs({ status })}`).then((r) => r.applications);

export const submitApplication = (data: ApplicationInput) =>
  request<{ application: Application }>('/applications', { method: 'POST', body: data }).then((r) => r.application);

export const reviewApplication = (id: string, role: string, decision: 'APPROVED' | 'REJECTED', reason?: string) =>
  request<{ application: Application }>(`/applications/${encodeURIComponent(id)}/review`, {
    method: 'POST', body: { role, decision, reason },
  }).then((r) => r.application);

// ---------------------------------------------------------------------------- allocations, payments, documents

export function reserveStand(applicationId: string, parcelId: string): Promise<Allocation> {
  // One key per user action: a double-click or retry returns the same reservation instead of failing.
  const idempotencyKey = `res_${applicationId}_${parcelId}`;
  return request<{ allocation: Allocation }>('/allocations/reserve', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: { applicationId, parcelId },
  }).then((r) => r.allocation);
}

export const recordPayment = (p: {
  allocationId: string; channel: PaymentChannel; currency: Currency; amount: string; externalReference: string;
}) =>
  request<PaymentResult>('/payments', {
    method: 'POST',
    body: {
      allocationId: p.allocationId,
      channel: p.channel,
      currency: p.currency,
      ...(p.currency === 'USD' ? { amountUsd: p.amount } : { amount: p.amount }),
      externalReference: p.externalReference,
    },
  });

export const fetchStatement = (allocationId: string) =>
  request<Statement>(`/allocations/${encodeURIComponent(allocationId)}/statement`);

export const signAgreement = (allocationId: string, planTerms?: { termMonths?: number; monthlyRateBps?: number; interestFreeMonths?: number }) =>
  request<IssuedDocument>(`/allocations/${encodeURIComponent(allocationId)}/sign-agreement`, {
    method: 'POST', body: { planTerms: planTerms ?? {} },
  });

export const signDeed = (allocationId: string) =>
  request<IssuedDocument>(`/allocations/${encodeURIComponent(allocationId)}/sign-deed`, { method: 'POST', body: {} });

export const fetchOwnerAllocations = () =>
  request<{ allocations: Allocation[] }>('/owner/my-allocations').then((r) => r.allocations);

// ---------------------------------------------------------------------------- youth self-registration & public transparency

export const registerYouthApplicant = (data: Partial<ApplicationInput>) =>
  request<{ application: Application; token: string; userSub: string; message: string }>('/public/youth-registration', {
    method: 'POST', body: data
  });

export interface PublicStandRegisterItem {
  stand_number: string;
  scheme_name: string;
  site_location: string;
  area_sqm: number;
  price_usd: string;
  status: string;
  quota_category: string;
  water_status: string;
  sewer_status: string;
  roads_status: string;
  allocation_status: string | null;
  allocated_on: string | null;
}

export interface QuotaSummaryItem {
  scheme_name: string;
  quota_category: string;
  stands: number;
  available: number;
  taken: number;
  share_percent: number;
}

export const fetchPublicAllocationRegister = (scheme?: string) =>
  request<{ count: number; stands: PublicStandRegisterItem[] }>(`/public/allocation-register${qs({ scheme })}`).then(r => r.stands);

export const fetchPublicQuotaSummary = (scheme?: string) =>
  request<{ quotas: QuotaSummaryItem[] }>(`/public/quota-summary${qs({ scheme })}`).then(r => r.quotas);

// ---------------------------------------------------------------------------- reminders, EcoCash push & operations

export const sendStatementNow = (allocationId: string) =>
  request<{ status: string; messageId: string | null }>(`/allocations/${encodeURIComponent(allocationId)}/statement/send`, { method: 'POST' });

export const sendPaymentReminderNow = (allocationId: string) =>
  request<{ status: string; messageId: string | null }>(`/allocations/${encodeURIComponent(allocationId)}/reminder/send`, { method: 'POST' });

export const triggerEcoCashPush = (p: { accountRef: string; amount: string; payerPhone?: string; currency?: Currency }) =>
  request<{ status: string; reference: string; result: any }>('/payments/ecocash-push', {
    method: 'POST', body: p
  });

export interface OutboundMessage {
  message_id: string;
  subject_id: string;
  to_phone: string;
  channel: 'WHATSAPP' | 'SMS';
  template: string;
  body: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export const fetchOutboundMessages = (status?: string) =>
  request<{ count: number; messages: OutboundMessage[] }>(`/messages${qs({ status })}`).then(r => r.messages);

export const triggerScheduledJobs = () =>
  request<{ overdueMarked: number; remindersQueued: number; statementsQueued: number; dispatched: any }>('/admin/jobs/run', { method: 'POST' });

// ---------------------------------------------------------------------------- construction operations

const C = '/construction';
const id = encodeURIComponent;
const post = <T>(path: string, body: unknown = {}) => request<T>(`${C}${path}`, { method: 'POST', body });
const put = <T>(path: string, body: unknown) => request<T>(`${C}${path}`, { method: 'PUT', body });
const get = <T>(path: string) => request<T>(`${C}${path}`);

// projects
export const fetchProjects = () => get<{ projects: ConstructionProject[] }>('/projects').then((r) => r.projects);
export const createProject = (body: Record<string, unknown>) => post<{ project: ConstructionProject }>('/projects', body).then((r) => r.project);
export const setProjectStatus = (projectId: string, status: ProjectStatus) =>
  put<{ project: ConstructionProject }>(`/projects/${id(projectId)}/status`, { status }).then((r) => r.project);

// job costing
export const fetchMaterials = () => get<{ materials: Material[] }>('/materials').then((r) => r.materials);
export const createMaterial = (body: Record<string, unknown>) => post<{ material: Material }>('/materials', body).then((r) => r.material);
export const fetchBudgetLines = (projectId: string) =>
  get<{ lines: BudgetLine[] }>(`/projects/${id(projectId)}/budget-lines`).then((r) => r.lines);
export const addBudgetLine = (projectId: string, body: Record<string, unknown>) => post(`/projects/${id(projectId)}/budget-lines`, body);
export const adjustBudget = (projectId: string, lineId: string, amountUsd: string, reason: string) =>
  post(`/projects/${id(projectId)}/budget-lines/${id(lineId)}/adjustments`, { amountUsd, reason });
export const fetchCostEntries = (projectId: string, filter: { category?: string; lineId?: string } = {}) =>
  get<{ entries: CostEntry[] }>(`/projects/${id(projectId)}/cost-entries${qs(filter)}`).then((r) => r.entries);
export type CostKind = 'material' | 'labour' | 'equipment' | 'overhead';
export const postCost = (projectId: string, kind: CostKind, body: Record<string, unknown>) =>
  post<{ entry: { entry_id: string; amount_usd: string } }>(`/projects/${id(projectId)}/cost-entries/${kind}`, body).then((r) => r.entry);
export const reverseCostEntry = (entryId: string, reason: string) => post(`/cost-entries/${id(entryId)}/reverse`, { reason });
export const fetchJobCostReport = (projectId: string) => get<JobCostReport>(`/projects/${id(projectId)}/job-cost-report`);

// site progress
export const fetchMilestones = (projectId: string) =>
  get<{ milestones: Milestone[] }>(`/projects/${id(projectId)}/milestones`).then((r) => r.milestones);
export const createMilestone = (projectId: string, body: Record<string, unknown>) => post(`/projects/${id(projectId)}/milestones`, body);
export const fetchDailyReports = (projectId: string) =>
  get<{ reports: DailyReport[] }>(`/projects/${id(projectId)}/daily-reports`).then((r) => r.reports);
export const submitDailyReport = (projectId: string, body: Record<string, unknown>) => post(`/projects/${id(projectId)}/daily-reports`, body);
export const fetchProgress = (projectId: string) => get<ProjectProgress>(`/projects/${id(projectId)}/progress`);

// tenders & subcontracts
export const fetchSubcontractors = () => get<{ subcontractors: Subcontractor[] }>('/subcontractors').then((r) => r.subcontractors);
export const createSubcontractor = (body: Record<string, unknown>) => post('/subcontractors', body);
export const updateSubcontractor = (subcontractorId: string, body: { status?: string; taxClearanceExpiry?: string }) =>
  put(`/subcontractors/${id(subcontractorId)}`, body);
export const fetchTenders = (projectId?: string) => get<{ tenders: Tender[] }>(`/tenders${qs({ projectId })}`).then((r) => r.tenders);
export const createTender = (projectId: string, body: Record<string, unknown>) => post(`/projects/${id(projectId)}/tenders`, body);
export const fetchTender = (tenderId: string) => get<TenderDetail>(`/tenders/${id(tenderId)}`);
export const submitBid = (tenderId: string, body: Record<string, unknown>) => post(`/tenders/${id(tenderId)}/bids`, body);
export const closeTender = (tenderId: string) => post(`/tenders/${id(tenderId)}/close`);
export const scoreBid = (tenderId: string, bidId: string, technicalScore: string) =>
  put(`/tenders/${id(tenderId)}/bids/${id(bidId)}/score`, { technicalScore });
export const awardTender = (tenderId: string, body: Record<string, unknown>) =>
  post<{ subcontract: Subcontract; rank: number; budgetWarning: string | null }>(`/tenders/${id(tenderId)}/award`, body);
export const cancelTender = (tenderId: string, reason: string) => post(`/tenders/${id(tenderId)}/cancel`, { reason });
export const fetchSubcontracts = (projectId?: string) =>
  get<{ subcontracts: Subcontract[] }>(`/subcontracts${qs({ projectId })}`).then((r) => r.subcontracts);
export const fetchSubcontract = (subcontractId: string) => get<SubcontractDetail>(`/subcontracts/${id(subcontractId)}`);
export const addVariation = (subcontractId: string, amountUsd: string, reason: string) =>
  post(`/subcontracts/${id(subcontractId)}/variations`, { amountUsd, reason });
export const setSubcontractStatus = (subcontractId: string, status: 'COMPLETED' | 'TERMINATED') =>
  put(`/subcontracts/${id(subcontractId)}/status`, { status });
export const submitClaim = (subcontractId: string, periodEnd: string, claimedCumulativeUsd: string) =>
  post(`/subcontracts/${id(subcontractId)}/claims`, { periodEnd, claimedCumulativeUsd });
export const certifyClaim = (claimId: string, certifiedCumulativeUsd: string) => post(`/claims/${id(claimId)}/certify`, { certifiedCumulativeUsd });
export const rejectClaim = (claimId: string, reason: string) => post(`/claims/${id(claimId)}/reject`, { reason });
export const payClaim = (claimId: string, paymentReference: string) => post(`/claims/${id(claimId)}/pay`, { paymentReference });

// quality
export const fetchInspections = (projectId: string) =>
  get<{ inspections: Inspection[] }>(`/projects/${id(projectId)}/inspections`).then((r) => r.inspections);
export const createInspection = (projectId: string, body: Record<string, unknown>) =>
  post<{ inspection: Inspection; ncrs: NonConformance[] }>(`/projects/${id(projectId)}/inspections`, body);
export const fetchNcrs = (projectId: string) => get<{ ncrs: NonConformance[] }>(`/projects/${id(projectId)}/ncrs`).then((r) => r.ncrs);
export const raiseNcr = (projectId: string, body: Record<string, unknown>) => post(`/projects/${id(projectId)}/ncrs`, body);
export const fetchQualitySummary = (projectId: string) => get<QualitySummary>(`/projects/${id(projectId)}/quality-summary`);
export const resolveNcr = (ncrId: string, correctiveAction: string) => post(`/ncrs/${id(ncrId)}/resolve`, { correctiveAction });
export const closeNcr = (ncrId: string, verificationNote: string) => post(`/ncrs/${id(ncrId)}/close`, { verificationNote });
export const reopenNcr = (ncrId: string, reason: string) => post(`/ncrs/${id(ncrId)}/reopen`, { reason });

// plant & maintenance
export const fetchEquipment = () => get<{ equipment: Equipment[] }>('/equipment').then((r) => r.equipment);
export const createEquipment = (body: Record<string, unknown>) => post('/equipment', body);
export const setEquipmentStatus = (equipmentId: string, status: 'AVAILABLE' | 'OUT_OF_SERVICE') =>
  put(`/equipment/${id(equipmentId)}/status`, { status });
export const fetchFleetSummary = () => get<FleetSummary>('/equipment/fleet-summary');
export const fetchMaintenance = (equipmentId: string) =>
  get<{ logs: MaintenanceLog[] }>(`/equipment/${id(equipmentId)}/maintenance`).then((r) => r.logs);
export const reportMaintenance = (equipmentId: string, body: Record<string, unknown>) => post(`/equipment/${id(equipmentId)}/maintenance`, body);
export const completeMaintenance = (logId: string, body: Record<string, unknown>) => post(`/maintenance/${id(logId)}/complete`, body);

// ---------------------------------------------------------------------------- Sales, CX & Digital Channels CRM Pipeline

async function erpRequest<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const role = 'sales';
  let res: Response;
  try {
    res = await fetch(`${ERP_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role,
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Cannot reach ERP server at ${ERP_BASE}. Check that server.py is running.`);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'HTTP_ERROR', data?.message ?? `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

export const fetchCRMPipeline = () =>
  erpRequest<PipelineSummary>('/api/crm/pipeline');

export const fetchCRMInquiries = (channel?: string, status?: string) =>
  erpRequest<{ inquiries: RealEstateInquiry[]; total: number }>(`/api/crm/inquiries${qs({ channel, status })}`).then(r => r.inquiries);

export const createCRMInquiry = (inquiry: Partial<RealEstateInquiry>) =>
  erpRequest<RealEstateInquiry>('/api/crm/inquiries', { method: 'POST', body: inquiry });

export const fetchCRMCommunications = (customer?: string, ref?: string) =>
  erpRequest<{ communications: CommunicationRecord[]; total: number }>(`/api/crm/communications${qs({ customer, ref })}`).then(r => r.communications);

export const logCRMCommunication = (comm: Partial<CommunicationRecord>) =>
  erpRequest<CommunicationRecord>('/api/crm/communications', { method: 'POST', body: comm });

export const advanceCRMDealStage = (dealId: string, newStage: string, notes?: string) =>
  erpRequest<SalesDeal>('/api/crm/deals/stage', { method: 'POST', body: { deal_id: dealId, new_stage: newStage, notes } });

export const fetchCRMChannelMetrics = () =>
  erpRequest<DigitalChannelMetrics>('/api/crm/channels/metrics');

// ============================================================================
// Supply Chain & Inventory Management Suite API Client
// ============================================================================

import type {
  WMSStockItem, WMSStockTransfer, SupplyChainPurchaseOrder, ThreeWayMatchResult,
  BillOfMaterialsRecord, MRPExplosionResult, ProductionWorkOrderRecord, EngineeringChangeOrderRecord
} from './types';

export const fetchWMSStockOverview = () =>
  erpRequest<{ stock: WMSStockItem[]; locations: string[] }>('/api/supplychain/wms/stock');

export const fetchWMSTransfers = () =>
  erpRequest<{ transfers: WMSStockTransfer[]; total: number }>('/api/supplychain/wms/transfers');

export const createWMSTransfer = (transfer: {
  source_location: string;
  dest_location: string;
  item_id: string;
  quantity: number;
  requested_by: string;
  authorized_by: string;
  dispatched_by: string;
}) => erpRequest<{ success: boolean; transfer_id: string; status: string }>('/api/supplychain/wms/transfer', {
  method: 'POST',
  body: transfer,
});

export const confirmWMSTransferReceipt = (transfer_id: string, received_by: string) =>
  erpRequest<{ success: boolean; transfer_id: string; status: string }>('/api/supplychain/wms/transfer/confirm', {
    method: 'POST',
    body: { transfer_id, received_by },
  });

export const fetchPurchasingOverview = () =>
  erpRequest<{
    requisitions: any[];
    purchase_orders: SupplyChainPurchaseOrder[];
    vendors: any[];
  }>('/api/supplychain/purchasing/requisitions');

export const executeThreeWayInvoiceMatch = (po_id: string, invoice_number: string, invoice_date: string, billed_amount_usd: number) =>
  erpRequest<ThreeWayMatchResult>('/api/supplychain/purchasing/match', {
    method: 'POST',
    body: { po_id, invoice_number, invoice_date, billed_amount_usd },
  });

export const triggerAutomatedReplenishment = (item_id: string, quantity: number, target_site?: string) =>
  erpRequest<{
    success: boolean;
    po_id: string;
    grn_reference: string;
    three_way_match: string;
    new_stock_level: number;
  }>('/api/supplychain/purchasing/replenish', {
    method: 'POST',
    body: { item_id, quantity, target_site },
  });

export const fetchManufacturingBOMs = () =>
  erpRequest<{
    boms: BillOfMaterialsRecord[];
    production_orders: ProductionWorkOrderRecord[];
    ecos: EngineeringChangeOrderRecord[];
  }>('/api/supplychain/mfg/boms');

export const calculateMRPExplosion = (code: string, qty: number) =>
  erpRequest<MRPExplosionResult>(`/api/supplychain/mfg/explode?code=${encodeURIComponent(code)}&qty=${qty}`);

export const assemblePrefabComponent = (product_code: string, quantity: number, destination_site?: string) =>
  erpRequest<{
    success: boolean;
    product_code: string;
    quantity_manufactured: number;
    work_order_id: string;
    qc_pass_rate_pct: number;
    destination_site: string;
    inbound_stock: number;
  }>('/api/supplychain/mfg/assemble', {
    method: 'POST',
    body: { product_code, quantity, destination_site },
  });

export const submitEngineeringChangeOrder = (eco: {
  product_code: string;
  title: string;
  justification: string;
  old_revision: string;
  new_revision: string;
  requested_by: string;
}) => erpRequest<{ success: boolean; eco_id: string; status: string }>('/api/supplychain/mfg/eco', {
  method: 'POST',
  body: eco,
});

