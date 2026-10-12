export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (code, message) => new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

/** Translates PostgreSQL integrity errors into stable API errors. Anything unknown is rethrown untouched. */
export function mapDbError(err) {
  if (err instanceof AppError) return err;
  if (err?.code === 'ZH001') return conflict('STAND_NOT_AVAILABLE', 'This stand is no longer available');
  if (err?.code === 'ZH002') return conflict('IMMUTABLE_RECORD', 'This record cannot be changed');
  if (err?.code === 'ZH003') return new AppError(500, 'LEDGER_UNBALANCED', 'Ledger entry rejected: unbalanced');
  if (err?.code === 'ZH004') return conflict('NOT_PAID_IN_FULL', 'Title deed requires the allocation to be paid in full');
  if (err?.code === 'ZH005') return conflict('SERVICING_NOT_CERTIFIED', 'Title deed requires 100% certified servicing (water, sewer, roads)');
  if (err?.code === 'ZH010') return conflict('COST_CATEGORY_MISMATCH', err.message);
  if (err?.code === 'ZH011') return conflict('PROJECT_CLOSED', 'This project is closed to new costs');
  if (err?.code === 'ZH012') return conflict('EQUIPMENT_UNAVAILABLE', err.message);
  if (err?.code === 'ZH013') return conflict('BUDGET_NEGATIVE', err.message);
  if (err?.code === 'ZH014') return conflict('TENDER_NOT_OPEN', err.message);
  if (err?.code === 'ZH015') return conflict('CLAIM_EXCEEDS_CONTRACT', err.message);
  if (err?.code === 'ZH016') return conflict('OPEN_NCR_BLOCKS_COMPLETION', err.message);
  if (err?.code === 'ZH017') return conflict('PROGRESS_CANNOT_DECREASE', err.message);
  if (err?.code === 'ZH018') return conflict('MILESTONE_WEIGHTS_EXCEED_100', err.message);
  if (err?.code === '23505') {
    const c = err.constraint ?? '';
    if (c.includes('uq_budget_cost_code')) return conflict('COST_CODE_EXISTS', 'This cost code is already budgeted on the project');
    if (c.includes('construction_projects_code')) return conflict('PROJECT_CODE_EXISTS', 'A project with this code already exists');
    if (c.includes('materials_pkey')) return conflict('MATERIAL_EXISTS', 'A material with this code already exists');
    if (c.includes('equipment_asset_tag')) return conflict('ASSET_TAG_EXISTS', 'Equipment with this asset tag already exists');
    if (c.includes('uq_subcontractor_registration')) return conflict('SUBCONTRACTOR_EXISTS', 'A subcontractor with this registration number already exists');
    if (c.includes('subcontractors_user_sub')) return conflict('SUBCONTRACTOR_LOGIN_LINKED', 'That sign-in is already linked to another subcontractor');
    if (c.includes('uq_tender_reference')) return conflict('TENDER_REFERENCE_EXISTS', 'A tender with this reference already exists');
    if (c.includes('uq_one_bid_per_bidder')) return conflict('BID_ALREADY_SUBMITTED', 'This subcontractor has already bid on this tender');
    if (c.includes('uq_one_open_claim')) return conflict('CLAIM_ALREADY_OPEN', 'A claim on this subcontract is still awaiting certification');
    if (c.includes('uq_daily_report_per_day')) return conflict('DAILY_REPORT_EXISTS', 'A site report for this project and date already exists');
    if (c.includes('uq_open_maintenance')) return conflict('MAINTENANCE_ALREADY_OPEN', 'This equipment already has an open maintenance job');
    if (c.includes('reversal_of')) return conflict('ENTRY_ALREADY_REVERSED', 'This cost entry has already been reversed');
    if (c.includes('project_milestones_project_id_seq')) return conflict('MILESTONE_SEQ_EXISTS', 'A milestone with this sequence number already exists');
    if (c.includes('uq_live_allocation_per_parcel')) return conflict('STAND_ALREADY_ALLOCATED', 'This stand is already allocated');
    if (c.includes('uq_live_allocation_per_subject')) return conflict('APPLICANT_ALREADY_HOLDS_STAND', 'This person already holds a stand');
    if (c.includes('uq_one_open_application_per_subject')) return conflict('OPEN_APPLICATION_EXISTS', 'This person already has an application in progress');
    if (c.includes('uq_payment_channel_reference') || c.includes('uq_inbox_channel_reference')) {
      return conflict('PAYMENT_REFERENCE_REUSED', 'This payment reference was already recorded');
    }
    if (c.includes('national_id')) return conflict('NATIONAL_ID_EXISTS', 'A person with this national ID is already registered');
    if (c.includes('stand_number')) return conflict('STAND_NUMBER_EXISTS', 'A stand with this number already exists');
    return conflict('DUPLICATE', 'A record with these details already exists');
  }
  if (err?.code === '40001' || err?.code === '40P01') return new AppError(503, 'RETRY', 'Temporary contention, please retry');
  return err;
}
