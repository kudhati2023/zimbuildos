import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  developments,
  stands,
  applications,
  youthApplicantsStore,
  allocationsStore,
  outboundMessagesStore,
  auditLogs,
  constructionProjects,
  constructionMaterials,
  constructionEquipment,
} from './src/server/store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ============================================================================
// 1. System Health Checks
// ============================================================================
app.get('/healthz', (_req, res) => {
  res.json({ status: 'UP', service: 'zhms-api', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'HEALTHY', service: 'Zimbuild Secure ERP Gateway', timestamp: new Date().toISOString() });
});

// ============================================================================
// 2. Spatial Cadastre & GIS API (/api/v1)
// ============================================================================
app.get('/api/v1/gis/developments', (_req, res) => {
  res.json({ developments });
});

app.get('/api/v1/gis/developments/:id/stands', (req, res) => {
  const devStands = stands.filter((s) => s.development_id === req.params.id);
  res.json({
    type: 'FeatureCollection',
    features: devStands.map((s) => ({
      type: 'Feature',
      geometry: s.geometry,
      properties: { ...s },
    })),
  });
});

app.get('/api/v1/spatial/stands', (req, res) => {
  const { scheme, status } = req.query;
  let result = [...stands];
  if (scheme) result = result.filter((s) => s.scheme_name === scheme || s.development_id === scheme);
  if (status) result = result.filter((s) => s.status === status || s.cadastre_status === status);
  res.json({ count: result.length, stands: result });
});

app.post('/api/v1/gis/developments/:id/stands/import', (req, res) => {
  const fc = req.body;
  const count = Array.isArray(fc?.features) ? fc.features.length : 1;
  res.json({ importedCount: count, message: 'GeoJSON imported successfully' });
});

app.put('/api/v1/stands/:parcelId/servicing', (req, res) => {
  const stand = stands.find((s) => s.parcel_id === req.params.parcelId || s.stand_number === req.params.parcelId);
  if (stand) {
    const { water, sewer, roads, certificateRef } = req.body;
    if (water) stand.servicing.water = water;
    if (sewer) stand.servicing.sewer = sewer;
    if (roads) stand.servicing.roads = roads;
    if (certificateRef) stand.servicing_certificate_ref = certificateRef;
    stand.fully_serviced =
      stand.servicing.water === 'CERTIFIED' &&
      stand.servicing.sewer === 'CERTIFIED' &&
      stand.servicing.roads === 'CERTIFIED';
    res.json({ stand });
  } else {
    res.status(404).json({ error: 'Stand not found' });
  }
});

// ============================================================================
// 3. Applications Queue & Youth Self-Registration (/api/v1)
// ============================================================================
app.get('/api/v1/applications', (req, res) => {
  const { status } = req.query;
  const list = status ? applications.filter((a) => a.status === status) : applications;
  res.json({ applications: list });
});

app.post('/api/v1/applications', (req, res) => {
  const newApp = {
    id: `APP-2026-${String(applications.length + 1).padStart(3, '0')}`,
    ...req.body,
    status: 'SUBMITTED',
    stage: 'LAND_OFFICER_REVIEW',
    created_at: new Date().toISOString(),
  };
  applications.unshift(newApp);
  res.status(201).json({ status: 'SUBMITTED', application: newApp });
});

app.post('/api/v1/applications/:id/review', (req, res) => {
  const appItem = applications.find((a) => a.id === req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });
  const { role, decision, reason } = req.body;
  if (role === 'LAND_OFFICER') {
    appItem.land_officer_review = { decision, reason, reviewer: 'L. Moyo', reviewed_at: new Date().toISOString() };
    if (decision === 'APPROVED') appItem.status = 'PENDING_FINANCE';
    else appItem.status = 'REJECTED';
  } else if (role === 'FINANCE_MANAGER') {
    appItem.finance_review = { decision, reason, reviewer: 'C. Sibanda', reviewed_at: new Date().toISOString() };
    if (decision === 'APPROVED') appItem.status = 'PENDING_CEO';
    else appItem.status = 'REJECTED';
  } else if (role === 'CEO') {
    appItem.ceo_review = { decision, reason, reviewer: 'Dr. T. Manzungu', reviewed_at: new Date().toISOString() };
    if (decision === 'APPROVED') appItem.status = 'APPROVED';
    else appItem.status = 'REJECTED';
  }
  res.json({ application: appItem });
});

app.post('/api/v1/public/youth-registration', (req, res) => {
  const body = req.body;
  const id = `APP-2026-${String(applications.length + 1).padStart(3, '0')}`;
  const newApp = {
    id,
    national_id: body.nationalId || body.national_id || '',
    first_name: body.firstName || body.first_name || '',
    last_name: body.lastName || body.last_name || '',
    date_of_birth: body.dateOfBirth || body.dob || '',
    phone_number: body.phoneNumber || body.phone || '',
    physical_address: body.physicalAddress || body.address || '',
    preferred_scheme: body.preferredScheme || body.scheme_preference || 'dev-hre-budiriro',
    quota_category: 'YOUTH',
    status: 'SUBMITTED',
    stage: 'LAND_OFFICER_REVIEW',
    created_at: new Date().toISOString(),
  };
  applications.unshift(newApp);

  const youthRecord = {
    applicant_id: `YOUTH-APP-2026-${String(youthApplicantsStore.length + 1).padStart(3, '0')}`,
    full_name: `${newApp.first_name} ${newApp.last_name}`.trim(),
    national_id: newApp.national_id,
    dob: newApp.date_of_birth,
    age: 23,
    phone: newApp.phone_number,
    email: body.email || 'applicant@zimbuild.co.zw',
    scheme_preference: newApp.preferred_scheme,
    preferred_stand: body.preferredStand || 'STAND-105',
    annual_income_usd: Number(body.annual_income_usd) || 7200.0,
    quota_verified: true,
    registered_at: new Date().toISOString(),
    status: 'PENDING_REVIEW',
  };
  youthApplicantsStore.unshift(youthRecord);

  // Generate lightweight JWT token for immediate access
  const tokenPayload = {
    sub: newApp.id,
    roles: ['APPLICANT'],
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
  };
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')}.sig`;

  res.status(201).json({
    application: newApp,
    token,
    userSub: newApp.id,
    message: 'Youth application registered successfully under statutory quota mandate.',
  });
});

app.get('/api/v1/public/allocation-register', (req, res) => {
  const publicItems = stands.map((s) => ({
    stand_number: s.stand_number,
    scheme_name: s.scheme_name,
    site_location: 'Harare / Midlands',
    area_sqm: s.area_sqm,
    price_usd: s.price_usd.toFixed(2),
    status: s.status.toUpperCase(),
    quota_category: s.quota_category,
    water_status: s.servicing.water,
    sewer_status: s.servicing.sewer,
    roads_status: s.servicing.roads,
    allocation_status: s.allocation_status,
    allocated_on: s.allocation_status ? '2026-10-09' : null,
  }));
  res.json({ count: publicItems.length, stands: publicItems });
});

app.get('/api/v1/public/quota-summary', (_req, res) => {
  res.json({
    quotas: [
      { scheme_name: 'Budiriro Phase 2', quota_category: 'YOUTH', stands: 200, available: 65, taken: 135, share_percent: 40.0 },
      { scheme_name: 'Budiriro Phase 2', quota_category: 'WOMEN', stands: 100, available: 30, taken: 70, share_percent: 20.0 },
      { scheme_name: 'Budiriro Phase 2', quota_category: 'GENERAL', stands: 200, available: 50, taken: 150, share_percent: 40.0 },
      { scheme_name: 'Midlands 3500', quota_category: 'YOUTH', stands: 1400, available: 520, taken: 880, share_percent: 40.0 },
    ],
  });
});

// ============================================================================
// 4. Stand Reservations, Payments, Ledger & Documents (/api/v1)
// ============================================================================
app.post('/api/v1/allocations/reserve', (req, res) => {
  const { applicationId, parcelId } = req.body;
  const stand = stands.find((s) => s.parcel_id === parcelId || s.stand_number === parcelId);
  const allocId = `ALLOC-2026-${String(allocationsStore.length + 1).padStart(3, '0')}`;
  const newAlloc = {
    allocation_id: allocId,
    id: allocId,
    stand_id: stand ? stand.stand_number : parcelId,
    parcel_id: parcelId,
    application_id: applicationId,
    buyer_name: 'Reserved Applicant',
    buyer_id_redacted: '63-******-R-44',
    buyer_phone: '+263 773 111222',
    category: stand?.quota_category || 'GENERAL',
    total_cost_usd: stand?.price_usd || 12000.0,
    deposit_usd: stand?.required_deposit_usd || 3000.0,
    deposit_required_usd: stand?.required_deposit_usd || 3000.0,
    paid_to_date_usd: 0.0,
    balance_usd: stand?.price_usd || 12000.0,
    instalments_total: 24,
    instalments_paid: 0,
    next_due_date: '2026-11-15',
    next_amount_usd: 375.0,
    status: 'RESERVED',
    title_deed_eligible: false,
    account_ref: `ZB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    scheme_name: stand?.scheme_name || 'Budiriro Youth Scheme',
    reservation_expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
  };
  allocationsStore.unshift(newAlloc);
  if (stand) {
    stand.status = 'pending_deposit';
    stand.cadastre_status = 'RESERVED';
    stand.allocation_id = allocId;
  }
  res.json({ allocation: newAlloc });
});

app.post('/api/v1/payments', (req, res) => {
  const { allocationId, channel, currency, amount, amountUsd, externalReference } = req.body;
  const amtUsd = parseFloat(amountUsd || amount || '0');
  const alloc = allocationsStore.find((a) => a.allocation_id === allocationId || a.stand_id === allocationId);
  if (alloc) {
    alloc.paid_to_date_usd = round(alloc.paid_to_date_usd + amtUsd, 2);
    alloc.balance_usd = Math.max(0, round(alloc.balance_usd - amtUsd, 2));
    alloc.instalments_paid += 1;
    if (alloc.balance_usd === 0) {
      alloc.status = 'FULLY_PAID_DEED_PENDING';
      alloc.title_deed_eligible = true;
    }
  }

  const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
  res.json({
    paymentId: `PAY-${Date.now()}`,
    allocationId,
    receiptNumber: receiptNo,
    amountUsd: amtUsd,
    currency: currency || 'USD',
    channel: channel || 'ECOCASH',
    externalReference: externalReference || `TXN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: 'POSTED',
    postedAt: new Date().toISOString(),
    journalNumber: `JRN-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
    balanceUsd: alloc ? alloc.balance_usd : 0,
  });
});

app.get('/api/v1/allocations/:id/statement', (req, res) => {
  const alloc = allocationsStore.find((a) => a.allocation_id === req.params.id || a.stand_id === req.params.id) || allocationsStore[0];
  res.json({
    allocation_id: alloc.allocation_id,
    account_ref: alloc.account_ref,
    stand_number: alloc.stand_id,
    scheme_name: alloc.scheme_name,
    buyer_name: alloc.buyer_name,
    total_cost_usd: alloc.total_cost_usd,
    deposit_required_usd: alloc.deposit_usd,
    paid_to_date_usd: alloc.paid_to_date_usd,
    balance_usd: alloc.balance_usd,
    currency: 'USD',
    status: alloc.status,
    transactions: [
      {
        id: 'TXN-001',
        date: '2026-10-01',
        description: 'Initial Deposit Received',
        channel: 'ECOCASH',
        amount_usd: alloc.deposit_usd,
        balance_usd: alloc.total_cost_usd - alloc.deposit_usd,
        reference: 'ECO-994821',
      },
    ],
  });
});

app.post('/api/v1/allocations/:id/sign-agreement', (req, res) => {
  res.json({
    document_id: `DOC-AGR-${req.params.id}`,
    allocation_id: req.params.id,
    document_type: 'AGREEMENT_OF_SALE',
    status: 'EXECUTED',
    signed_by: 'Dr. Tinashe Manzungu (Group CEO)',
    signed_at: new Date().toISOString(),
    verification_token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0',
    verification_url: `/api/v1/verify/a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0`,
  });
});

app.post('/api/v1/allocations/:id/sign-deed', (req, res) => {
  res.json({
    document_id: `DOC-DEED-${req.params.id}`,
    allocation_id: req.params.id,
    document_type: 'TITLE_DEED',
    status: 'ISSUED',
    deed_number: `TD-${Math.floor(Math.random() * 9000 + 1000)}/2026`,
    signed_by: 'Registrar of Deeds / Dr. T. Manzungu',
    signed_at: new Date().toISOString(),
    verification_token: 'b2c3d4e5f6a10718293a4b5c6d7e8f90123456789abcdef0',
  });
});

app.get('/api/v1/owner/my-allocations', (_req, res) => {
  res.json({ allocations: allocationsStore });
});

app.post('/api/v1/allocations/:id/statement/send', (req, res) => {
  const msgId = `MSG-${Date.now()}`;
  res.json({ status: 'QUEUED', messageId: msgId });
});

app.post('/api/v1/allocations/:id/reminder/send', (req, res) => {
  const msgId = `MSG-${Date.now()}`;
  res.json({ status: 'QUEUED', messageId: msgId });
});

app.post('/api/v1/payments/ecocash-push', (req, res) => {
  const ref = `ECO-PUSH-${Date.now().toString().slice(-6)}`;
  res.json({ status: 'SUCCESS', reference: ref, result: { status: 'PROCESSED', accountRef: req.body.accountRef } });
});

app.get('/api/v1/messages', (_req, res) => {
  res.json({ count: outboundMessagesStore.length, messages: outboundMessagesStore });
});

app.post('/api/v1/admin/jobs/run', (_req, res) => {
  res.json({ overdueMarked: 0, remindersQueued: 2, statementsQueued: 3, dispatched: { sms: 1, whatsapp: 1 } });
});

// ============================================================================
// 5. Construction Operations API (/api/v1/construction/...)
// ============================================================================
app.get('/api/v1/construction/projects', (_req, res) => {
  res.json({ projects: constructionProjects });
});

app.post('/api/v1/construction/projects', (req, res) => {
  const newPrj = {
    id: `PRJ-${Date.now().toString().slice(-4)}`,
    ...req.body,
    status: 'ACTIVE',
    cpi: 1.0,
    spi: 1.0,
  };
  constructionProjects.push(newPrj as any);
  res.json({ project: newPrj });
});

app.put('/api/v1/construction/projects/:id/status', (req, res) => {
  const prj = constructionProjects.find((p) => p.id === req.params.id);
  if (prj) (prj as any).status = req.body.status;
  res.json({ project: prj });
});

app.get('/api/v1/construction/materials', (_req, res) => {
  res.json({ materials: constructionMaterials });
});

app.post('/api/v1/construction/materials', (req, res) => {
  const newMat = { id: `MAT-${Date.now().toString().slice(-4)}`, ...req.body };
  constructionMaterials.push(newMat as any);
  res.json({ material: newMat });
});

app.get('/api/v1/construction/projects/:id/budget-lines', (req, res) => {
  res.json({
    lines: [
      { id: 'BL-01', project_id: req.params.id, category: 'MATERIALS', description: 'Structural concrete & rebar', budget_usd: 180000.0, actual_usd: 95000.0, commitments_usd: 25000.0 },
      { id: 'BL-02', project_id: req.params.id, category: 'LABOUR', description: 'Artisans & general site workforce', budget_usd: 85000.0, actual_usd: 42000.0, commitments_usd: 0.0 },
      { id: 'BL-03', project_id: req.params.id, category: 'PLANT', description: 'Excavation & compaction equipment', budget_usd: 65000.0, actual_usd: 31000.0, commitments_usd: 12000.0 },
      { id: 'BL-04', project_id: req.params.id, category: 'SUBCONTRACT', description: 'Electrical & Plumbing reticulation', budget_usd: 140000.0, actual_usd: 50500.0, commitments_usd: 45000.0 },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/cost-entries', (_req, res) => {
  res.json({
    entries: [
      { entry_id: 'CST-001', date: '2026-10-02', category: 'MATERIALS', description: '100 bags PPC Cement', amount_usd: 1050.0 },
      { entry_id: 'CST-002', date: '2026-10-05', category: 'LABOUR', description: 'Week 40 Artisan Payroll', amount_usd: 3400.0 },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/job-cost-report', (req, res) => {
  res.json({
    project_id: req.params.id,
    budget_total_usd: 650000.0,
    actual_cost_usd: 218500.0,
    commitments_usd: 82000.0,
    earned_value_usd: 235000.0,
    cpi: 1.08,
    spi: 0.98,
    estimate_at_completion_usd: 601850.0,
    variance_usd: 48150.0,
  });
});

app.get('/api/v1/construction/projects/:id/milestones', (req, res) => {
  res.json({
    milestones: [
      { id: 'MS-01', project_id: req.params.id, name: 'Site Clearing & Bulk Earthworks', weight_percent: 15, progress_percent: 100, status: 'COMPLETED' },
      { id: 'MS-02', project_id: req.params.id, name: 'Foundations & Substructure', weight_percent: 25, progress_percent: 85, status: 'IN_PROGRESS' },
      { id: 'MS-03', project_id: req.params.id, name: 'Superstructure Brickwork & Lintels', weight_percent: 30, progress_percent: 30, status: 'IN_PROGRESS' },
      { id: 'MS-04', project_id: req.params.id, name: 'Roofing, Trusses & Waterproofing', weight_percent: 15, progress_percent: 0, status: 'PENDING' },
      { id: 'MS-05', project_id: req.params.id, name: 'Finishes, Electrical & Plumbing', weight_percent: 15, progress_percent: 0, status: 'PENDING' },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/daily-reports', (_req, res) => {
  res.json({
    reports: [
      { report_id: 'DLR-2026-101', date: '2026-10-09', weather: 'Sunny 26°C', artisans: 18, general_hands: 32, delays: 'None', work_completed: 'Foundation concrete pour stands 401-405' },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/progress', (_req, res) => {
  res.json({ overallProgressPercent: 42.5, status: 'ON_TRACK', plannedPercent: 45.0, daysRemaining: 78 });
});

app.get('/api/v1/construction/subcontractors', (_req, res) => {
  res.json({
    subcontractors: [
      { id: 'SUB-01', name: 'Kadoma Earthworks Ltd', trade: 'Civil & Earthworks', tax_clearance_valid: true, status: 'ACTIVE' },
      { id: 'SUB-02', name: 'Harare Electrical Contractors', trade: 'Electrical Reticulation', tax_clearance_valid: true, status: 'ACTIVE' },
      { id: 'SUB-03', name: 'Zambezi Plumbing & Civils', trade: 'Wetlands Drainage & Water', tax_clearance_valid: true, status: 'ACTIVE' },
    ],
  });
});

app.get('/api/v1/construction/tenders', (_req, res) => {
  res.json({
    tenders: [
      { tender_id: 'TND-2026-001', title: 'Budiriro Road Surfacing & Kerbing', budget_usd: 85000.0, status: 'OPEN', closing_date: '2026-10-30' },
      { tender_id: 'TND-2026-002', title: 'Midlands Bulk Water Line (DN300)', budget_usd: 120000.0, status: 'EVALUATION', closing_date: '2026-10-10' },
    ],
  });
});

app.get('/api/v1/construction/subcontracts', (_req, res) => {
  res.json({
    subcontracts: [
      { subcontract_id: 'SC-01', tender_id: 'TND-2026-002', subcontractor_name: 'Kadoma Earthworks Ltd', value_usd: 115000.0, paid_usd: 45000.0, retention_usd: 4500.0, status: 'ACTIVE' },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/inspections', (_req, res) => {
  res.json({
    inspections: [
      { inspection_id: 'INSP-101', date: '2026-10-08', type: 'Foundations Trenching', result: 'PASS', inspector: 'Eng. K. Sibanda' },
      { inspection_id: 'INSP-102', date: '2026-10-09', type: 'Concrete Cube Slump', result: 'PASS', inspector: 'Eng. K. Sibanda' },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/ncrs', (_req, res) => {
  res.json({
    ncrs: [
      { ncr_id: 'NCR-2026-01', milestone: 'Foundations', severity: 'MINOR', description: 'Concrete curing blanket misplaced on Stand 402', status: 'CLOSED' },
    ],
  });
});

app.get('/api/v1/construction/projects/:id/quality-summary', (_req, res) => {
  res.json({ passRatePct: 98.2, openNcrs: 0, closedNcrs: 4, concreteCubeAverageMpa: 28.5 });
});

app.get('/api/v1/construction/equipment', (_req, res) => {
  res.json({ equipment: constructionEquipment });
});

app.get('/api/v1/construction/equipment/fleet-summary', (_req, res) => {
  res.json({
    totalPlant: 14,
    activeOnSites: 12,
    workshopMaintenance: 2,
    overallAvailabilityPercent: 88.5,
  });
});

// Generic catch-all for any other /api/v1/construction POST/PUT routes
app.post('/api/v1/construction/{*splat}', (req, res) => {
  res.json({ success: true, id: `ID-${Date.now()}`, body: req.body });
});
app.put('/api/v1/construction/{*splat}', (req, res) => {
  res.json({ success: true, updated: true, body: req.body });
});

// ============================================================================
// 6. Enterprise ERP Subsystem Routes (/api/...)
// ============================================================================
app.get('/api/portfolio', (_req, res) => {
  res.json({
    total_assets_usd: 12500000.0,
    gross_annual_rental_usd: 1420000.0,
    net_operating_income_usd: 1180000.0,
    occupancy_rate_pct: 94.2,
    properties_count: 8,
    total_units: 420,
    depreciation_schedule_run: '2026-Q3 Verified',
  });
});

app.get('/api/leases', (_req, res) => {
  res.json({
    active_leases: [
      { lease_id: 'LS-2026-01', tenant_name: 'Econet Wireless Zimbabwe', property: 'Zimbuild Plaza Fl 3', rent_usd: 4500.0, term_months: 36, status: 'ACTIVE' },
      { lease_id: 'LS-2026-02', tenant_name: 'Delta Beverages Distribution', property: 'Lupane Logistics Bay 2', rent_usd: 3200.0, term_months: 24, status: 'ACTIVE' },
      { lease_id: 'LS-2026-03', tenant_name: 'First Mutual Health Care', property: 'Highlands Medical Center', rent_usd: 5800.0, term_months: 60, status: 'ACTIVE' },
    ],
  });
});

app.get('/api/jobcosting', (_req, res) => {
  res.json({
    total_active_projects: 4,
    total_budget_usd: 2450000.0,
    total_actual_costs_usd: 940000.0,
    cpi: 1.06,
    spi: 0.99,
  });
});

app.get('/api/siteops/kpis', (_req, res) => {
  res.json({
    active_sites: 5,
    on_site_headcount: 142,
    machinery_utilization_pct: 88.0,
    safety_days_without_lpa: 312,
  });
});

app.get('/api/inventory', (_req, res) => {
  res.json({
    total_inventory_value_usd: 485000.0,
    stock_items_count: 128,
    reorder_warnings_count: 2,
    fast_moving_items: ['Cement PPC 42.5N', '12mm Deformed Rebar', '6-Inch Concrete Blocks'],
  });
});

app.get('/api/financials', (_req, res) => {
  res.json({
    gross_revenue_usd: 850000.0,
    gross_revenue_zwg: 22525000.0,
    rbz_zwg_fx_rate: 26.50,
    cost_of_sales_usd: 480000.0,
    gross_profit_usd: 370000.0,
    ebitda_usd: 245000.0,
    zimra_corporate_tax_usd: 61250.0,
    withholding_tax_usd: 12500.0,
  });
});

app.get('/api/security/audit', (_req, res) => {
  res.json({ audit_trail: auditLogs });
});

app.get('/api/security/verify_ledger', (_req, res) => {
  res.json({ verified: true, chain_status: 'UNCOMPROMISED', total_entries: auditLogs.length });
});

// CRM Routes
app.get('/api/crm/pipeline', (_req, res) => {
  res.json({
    total_pipeline_value_usd: 1845000.0,
    active_leads_count: 42,
    deals_by_stage: {
      NEW_LEAD: 14,
      QUALIFIED_PROSPECT: 12,
      SITE_VISIT_SCHEDULED: 8,
      AGREEMENT_NEGOTIATION: 5,
      CLOSED_WON: 3,
    },
    conversion_rate_pct: 28.5,
  });
});

const crmInquiriesStore = [
  { inquiry_id: 'INQ-101', customer_name: 'Blessing Ndlovu', phone: '+263 771 223344', email: 'b.ndlovu@outlook.com', source_channel: 'WHATSAPP_BOT', property_interest: 'Budiriro Stand 300m²', budget_usd: 14000, urgency: 'High', is_diaspora: true, diaspora_country: 'United Kingdom', status: 'NEW' },
  { inquiry_id: 'INQ-102', customer_name: 'Farai Katsande', phone: '+263 772 556677', email: 'fkatsande@yahoo.com', source_channel: 'WEBSITE', property_interest: 'Midlands 400m² High Rise', budget_usd: 18000, urgency: 'Medium', is_diaspora: false, diaspora_country: '', status: 'QUALIFIED' },
];

app.get('/api/crm/inquiries', (_req, res) => {
  res.json({ inquiries: crmInquiriesStore, total: crmInquiriesStore.length });
});

app.post('/api/crm/inquiries', (req, res) => {
  const inq = {
    inquiry_id: `INQ-${Date.now().toString().slice(-4)}`,
    ...req.body,
    status: 'NEW',
    created_at: new Date().toISOString(),
  };
  crmInquiriesStore.unshift(inq);
  res.json(inq);
});

const crmCommsStore = [
  { comm_id: 'COMM-001', customer_id_or_name: 'Blessing Ndlovu', channel: 'WHATSAPP', direction: 'OUTBOUND', client_sentiment: 'Positive', summary: 'Sent diaspora housing brochure and EcoCash payment steps', agent_name: 'Tapiwa Zhou', timestamp: '2026-10-09 10:15' },
];

app.get('/api/crm/communications', (_req, res) => {
  res.json({ communications: crmCommsStore, total: crmCommsStore.length });
});

app.post('/api/crm/communications', (req, res) => {
  const comm = { comm_id: `COMM-${Date.now().toString().slice(-4)}`, ...req.body, timestamp: new Date().toISOString() };
  crmCommsStore.unshift(comm);
  res.json(comm);
});

app.get('/api/crm/channels/metrics', (_req, res) => {
  res.json({
    whatsapp_inquiries: 185,
    web_portal_inquiries: 92,
    walk_in_counter: 34,
    diaspora_share_pct: 38.5,
    average_response_time_minutes: 4.2,
    customer_satisfaction_score: 4.8,
  });
});

app.get('/api/crm/customer', (_req, res) => {
  res.json({
    customer_id: 'CRM-CUST-101',
    name: 'Takudzwa Kunaka',
    total_spend_usd: 7500.0,
    credit_rating: 'AAA',
    loyalty_tier: 'DIAMOND',
  });
});

app.post('/api/crm/deals/stage', (req, res) => {
  res.json({ deal_id: req.body.deal_id, new_stage: req.body.new_stage, updated_at: new Date().toISOString() });
});

// Supply Chain & WMS
app.get('/api/supplychain/wms/stock', (_req, res) => {
  res.json({
    stock: [
      { item_id: 'WMS-01', item_code: 'CEM-425N', description: 'PPC 42.5N Cement', category: 'Raw Materials', warehouse_location: 'Central Stores Bay A3', quantity_on_hand: 1420, unit: 'Bags', unit_cost_usd: 10.50, total_value_usd: 14910.0, reorder_point: 400, status: 'OPTIMAL' },
      { item_id: 'WMS-02', item_code: 'REBAR-Y12', description: 'Deformed Steel Rebar Y12', category: 'Structural Steel', warehouse_location: 'Yard Bay S1', quantity_on_hand: 850, unit: 'Lengths', unit_cost_usd: 8.75, total_value_usd: 7437.50, reorder_point: 200, status: 'OPTIMAL' },
    ],
    locations: ['Central Stores Harare', 'Bulawayo Hub', 'Gweru Site Depot', 'Lupane Field Store'],
  });
});

app.get('/api/supplychain/wms/transfers', (_req, res) => {
  res.json({ transfers: [], total: 0 });
});

app.post('/api/supplychain/wms/transfer', (req, res) => {
  res.json({ success: true, transfer_id: `TRF-${Date.now().toString().slice(-4)}`, status: 'DISPATCHED' });
});

app.post('/api/supplychain/wms/transfer/confirm', (req, res) => {
  res.json({ success: true, transfer_id: req.body.transfer_id, status: 'RECEIVED' });
});

app.get('/api/supplychain/purchasing/requisitions', (_req, res) => {
  res.json({
    requisitions: [],
    purchase_orders: [
      { po_id: 'PO-2026-094', vendor_name: 'PPC Zimbabwe Ltd', total_amount_usd: 10500.0, status: 'DELIVERED', created_at: '2026-10-02' },
    ],
    vendors: [
      { vendor_id: 'VND-01', name: 'PPC Zimbabwe Ltd', category: 'Cement & Aggregate', status: 'APPROVED' },
      { vendor_id: 'VND-02', name: 'Steelmakers Zimbabwe', category: 'Reinforcing Steel', status: 'APPROVED' },
    ],
  });
});

app.post('/api/supplychain/purchasing/match', (req, res) => {
  res.json({
    three_way_match_passed: true,
    po_id: req.body.po_id,
    po_amount_usd: 10500.0,
    grn_verified_quantity: 1000,
    invoice_amount_usd: req.body.billed_amount_usd || 10500.0,
    variance_usd: 0.0,
    payment_status: 'AUTHORIZED_FOR_PAYMENT',
  });
});

app.post('/api/supplychain/purchasing/replenish', (req, res) => {
  res.json({
    success: true,
    po_id: `PO-${Date.now().toString().slice(-4)}`,
    grn_reference: `GRN-${Date.now().toString().slice(-4)}`,
    three_way_match: 'PASSED',
    new_stock_level: 1800,
  });
});

app.get('/api/supplychain/mfg/boms', (_req, res) => {
  res.json({
    boms: [
      { bom_id: 'BOM-PREFAB-01', product_code: 'PREFAB-WALL-01', product_name: 'Modular Lightweight Concrete Wall Panel 3m x 2.4m', standard_batch_qty: 10, total_batch_cost_usd: 480.0 },
    ],
    production_orders: [],
    ecos: [],
  });
});

app.get('/api/supplychain/mfg/explode', (req, res) => {
  const qty = Number(req.query.qty) || 10;
  res.json({
    product_code: req.query.code || 'PREFAB-WALL-01',
    required_quantity: qty,
    required_materials: [
      { code: 'CEM-425N', name: 'PPC Cement', qty_required: qty * 4, unit: 'Bags', total_cost_usd: qty * 4 * 10.50 },
      { code: 'SAND-RIVER', name: 'River Sand', qty_required: qty * 0.5, unit: 'm³', total_cost_usd: qty * 0.5 * 22.00 },
    ],
    total_estimated_cost_usd: qty * 48.0,
  });
});

app.post('/api/supplychain/mfg/assemble', (req, res) => {
  res.json({
    success: true,
    product_code: req.body.product_code,
    quantity_manufactured: req.body.quantity,
    work_order_id: `WO-${Date.now().toString().slice(-4)}`,
    qc_pass_rate_pct: 100,
    destination_site: req.body.destination_site || 'Budiriro Site Depot',
    inbound_stock: req.body.quantity,
  });
});

app.post('/api/supplychain/mfg/eco', (req, res) => {
  res.json({ success: true, eco_id: `ECO-${Date.now().toString().slice(-4)}`, status: 'PENDING_APPROVAL' });
});

// Human Capital & Field Service
app.get('/api/hr/summary', (_req, res) => {
  res.json({
    total_workforce: 184,
    active_site_artisans: 132,
    permanent_staff: 52,
    monthly_payroll_usd: 94500.0,
    payroll_compliance_rate_pct: 100.0,
  });
});

app.get('/api/hr/employees', (_req, res) => {
  res.json({
    employees: [
      { id: 'EMP-001', name: 'Dr. Tinashe Manzungu', role: 'Group CEO & Executive', department: 'Executive Governance', status: 'ACTIVE' },
      { id: 'EMP-002', name: 'Eng. Tapiwa Zhou', role: 'Head of Civil & Structures', department: 'Engineering Ops', status: 'ACTIVE' },
      { id: 'EMP-003', name: 'Chipo Sibanda', role: 'Financial Controller', department: 'Treasury & ZIMRA', status: 'ACTIVE' },
    ],
    total: 3,
  });
});

app.get('/api/recruitment/requisitions', (_req, res) => {
  res.json({ requisitions: [], candidates: [] });
});

app.get('/api/fleet/summary', (_req, res) => {
  res.json({
    total_fleet_units: 24,
    operating_on_projects: 21,
    workshop_inspection: 3,
    fuel_efficiency_index: '94.2%',
    chief_valuer_appraisal_usd: 3450000.0,
  });
});

app.get('/api/fieldservice/summary', (_req, res) => {
  res.json({
    open_work_orders: 8,
    resolved_today: 14,
    dispatch_sla_compliance_pct: 96.5,
    customer_rating: 4.9,
  });
});

app.get('/api/project/schedule', (_req, res) => {
  res.json({
    critical_path_activities: ['Earthworks & Platform Terracing', 'Trunk Sewer Reticulation', 'Road Base Compaction'],
    cpm_variance_days: 0,
    project_status: 'HEALTHY_ON_SCHEDULE',
  });
});

app.get('/api/quality/summary', (_req, res) => {
  res.json({
    concrete_cube_tests_passed: 48,
    failures: 0,
    average_strength_mpa: 28.5,
    snag_closure_rate_pct: 95.8,
  });
});

app.get('/api/permits/overview', (_req, res) => {
  res.json({
    active_municipal_permits: 6,
    subdivision_permits_approved: 3,
    ema_eia_certificates_active: 3,
    statutory_inspections_passed: 18,
  });
});

// Youth Applicants, Allocations Register & Messaging
app.get('/api/youth/applicants', (_req, res) => {
  res.json({
    total_applicants: youthApplicantsStore.length,
    applicants: youthApplicantsStore,
    statutory_quota_mandate_pct: 25.0,
  });
});

app.post('/api/youth/register', (req, res) => {
  const body = req.body;
  const newApp = {
    applicant_id: `YOUTH-APP-2026-${String(youthApplicantsStore.length + 1).padStart(3, '0')}`,
    full_name: body.full_name || 'Applicant',
    national_id: body.national_id || '63-0000000-X-00',
    dob: body.dob || '2002-01-01',
    age: body.age || 24,
    phone: body.phone || '+263 770 000000',
    email: body.email || 'applicant@zimbuild.co.zw',
    scheme_preference: body.scheme_preference || 'KADOMA_YOUTH_SCHEME',
    preferred_stand: body.preferred_stand || 'STAND-105',
    annual_income_usd: body.annual_income_usd || 7200.0,
    quota_verified: true,
    registered_at: new Date().toISOString(),
    status: 'APPROVED_AWAITING_DEPOSIT',
  };
  youthApplicantsStore.unshift(newApp);
  res.json({ success: true, applicant: newApp, message: 'Youth registered successfully.' });
});

app.get('/api/allocations/register', (_req, res) => {
  const totalCost = allocationsStore.reduce((acc, a) => acc + a.total_cost_usd, 0);
  const totalPaid = allocationsStore.reduce((acc, a) => acc + a.paid_to_date_usd, 0);
  const totalBalance = allocationsStore.reduce((acc, a) => acc + a.balance_usd, 0);
  const youthCount = allocationsStore.filter((a) => a.category === 'YOUTH_QUOTA').length;
  res.json({
    allocations: allocationsStore,
    metrics: {
      total_stands_allocated: allocationsStore.length,
      total_contract_value_usd: totalCost,
      total_collected_usd: totalPaid,
      total_debtors_balance_usd: totalBalance,
      youth_allocated_count: youthCount,
      youth_quota_percentage: allocationsStore.length ? round((youthCount / allocationsStore.length) * 100, 1) : 0,
    },
  });
});

app.get('/api/messaging/outbox', (_req, res) => {
  res.json({
    total_messages: outboundMessagesStore.length,
    messages: outboundMessagesStore,
  });
});

app.post('/api/messaging/send-reminder', (req, res) => {
  const { stand_id, recipient, text, channel } = req.body;
  const newMsg = {
    message_id: `MSG-2026-${String(outboundMessagesStore.length + 101).padStart(3, '0')}`,
    recipient: recipient || '+263 773 111222',
    recipient_name: 'Valued Buyer',
    type: channel === 'WHATSAPP' ? 'WHATSAPP_REMINDER' : 'SMS_REMINDER',
    stand_id: stand_id || 'STAND-001',
    text: text || 'Reminder: Your ZimBuild monthly installment is due.',
    status: 'DELIVERED',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
  };
  outboundMessagesStore.push(newMsg);
  res.json({ dispatched_message: newMsg, status: 'DELIVERED' });
});

app.post('/api/payments/ecocash-settle', (req, res) => {
  const { stand_id, amount_usd, payer_phone, fx_rate } = req.body;
  const usd = parseFloat(amount_usd || '312.50');
  const rate = parseFloat(fx_rate || '26.50');
  const alloc = allocationsStore.find((a) => a.stand_id === stand_id);
  if (alloc) {
    alloc.paid_to_date_usd = round(alloc.paid_to_date_usd + usd, 2);
    alloc.balance_usd = Math.max(0, round(alloc.balance_usd - usd, 2));
    alloc.instalments_paid += 1;
    if (alloc.balance_usd === 0) {
      alloc.status = 'FULLY_PAID_DEED_PENDING';
      alloc.title_deed_eligible = true;
    }
  }

  const recNo = `REC-ECO-${Math.floor(usd) + 200}`;
  const zwgAmount = round(usd * rate, 2);

  const confMsg = {
    message_id: `MSG-2026-${String(outboundMessagesStore.length + 101).padStart(3, '0')}`,
    recipient: payer_phone || '+263 773 111222',
    recipient_name: alloc?.buyer_name || 'Valued Buyer',
    type: 'ECOCASH_RECEIPT_SMS',
    stand_id: stand_id || 'STAND-001',
    text: `Payment Verified: $${usd.toFixed(2)} USD (ZWG ${zwgAmount.toFixed(2)}) received via EcoCash USSD Push for ${stand_id}. Receipt #${recNo}. Current balance: $${alloc?.balance_usd.toFixed(2) || '0.00'} USD.`,
    status: 'DELIVERED',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
  };
  outboundMessagesStore.push(confMsg);

  res.json({
    receipt_number: recNo,
    stand_id,
    amount_usd: usd,
    amount_zwg: zwgAmount,
    allocation: alloc,
    confirmation_message: confMsg,
    status: 'SETTLED',
  });
});

// Additional ERP Action Handlers
app.post('/api/tenant/screen', (req, res) => {
  const { full_name, income_usd, rent_usd } = req.body;
  const inc = parseFloat(income_usd || '0');
  const rnt = parseFloat(rent_usd || '0');
  const ratio = inc > 0 ? (rnt / inc) * 100 : 50;
  const approved = ratio <= 40;
  res.json({
    tenant_id: `TNT-${Date.now().toString().slice(-4)}`,
    full_name: full_name || 'Prospect Tenant',
    credit_score: approved ? 745 : 590,
    credit_status: approved ? 'QUALIFIED_APPROVED' : 'MARGINAL_CO_SIGNER_REQUIRED',
    screening_notes: `Rent-to-income ratio is ${ratio.toFixed(1)}%. ${approved ? 'Passes credit requirements.' : 'Requires 3 months deposit.'}`,
  });
});

app.post('/api/payment/certify', (req, res) => {
  const { app_id, certified_amount, variations } = req.body;
  const cert = parseFloat(certified_amount || '13500.0');
  const vars = parseFloat(variations || '750.0');
  const retention = round(cert * 0.1, 2);
  const net = round(cert - retention + vars, 2);
  res.json({
    app_id: app_id || 'PAY-APP-101',
    certified_amount_usd: cert,
    retention_rate_pct: 10.0,
    retention_withheld_usd: retention,
    variation_claims_usd: vars,
    net_payable_amount_usd: net,
  });
});

app.post('/api/siteops/three-way-match', (req, res) => {
  res.json({
    three_way_match_passed: true,
    po_id: req.body.po_id || 'PO-2026-094',
    matched_amount_usd: req.body.invoiced_amount || 5250.0,
    authorized_by: 'Eng. Tapiwa Zhou (QS / Site Mgr)',
    status: 'VERIFIED_FOR_DISBURSEMENT',
  });
});

app.post('/api/dlap/verify', (req, res) => {
  res.json({
    deed_number: req.body.deed_number || 'TD-4982/2021',
    valid: true,
    owner: 'Zimbuild Property Holdings (Pvt) Ltd',
    encumbrances: 'NONE',
    dlap_si_76_status: 'REGISTERED_VERIFIED',
  });
});

app.post('/api/dlap/caveat', (req, res) => {
  res.json({
    deed_number: req.body.deed_number || 'TD-4982/2021',
    caveat_ref: `CAV-${Date.now().toString().slice(-4)}`,
    validation_status: 'LOCKED',
    message: 'Electronic caveat updated under SI 76/2025.',
  });
});

app.post('/api/inventory/dispatch', (req, res) => {
  res.json({
    dispatch_id: `DSP-${Date.now().toString().slice(-4)}`,
    material_id: req.body.material_id,
    quantity: req.body.quantity,
    site: req.body.site,
    status: 'DISPATCHED_TO_SITE',
    dispatched_at: new Date().toISOString(),
  });
});

app.post('/api/stands/sell', (req, res) => {
  res.json({
    sale_id: `SALE-${Date.now().toString().slice(-4)}`,
    stand_id: req.body.stand_id,
    buyer_name: req.body.buyer_name,
    amount_usd: req.body.amount_usd,
    conveyancer_status: 'AGREEMENT_DRAFTED',
  });
});

app.post('/api/pos/pay', (req, res) => {
  res.json({
    receipt_no: `POS-${Date.now().toString().slice(-6)}`,
    amount_usd: req.body.amount_usd,
    channel: req.body.channel || 'CASH',
    cashier: 'Main POS Desk',
    status: 'SUCCESS',
  });
});

app.post('/api/offline/sync', (req, res) => {
  res.json({ synced: true, records_processed: 5, server_time: new Date().toISOString() });
});

// Helper math
function round(value: number, decimals: number): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

// ============================================================================
// 7. Frontend Integration (Vite in Dev / Static in Prod)
// ============================================================================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('{*splat}', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[ZIMBUILD ERP & ZHMS PLATFORM] Running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SERVER ERROR]', err);
  process.exit(1);
});
