import { badRequest, notFound, conflict, forbidden } from './errors.js';
import { audit } from './db.js';
import { numericToCents, centsToNumeric } from './money.js';
import { todayHarare, addDays } from './dates.js';
import { insertCostEntry } from './jobCostService.js';
import { hasRole, ROLES } from './auth.js';
import * as f from './fields.js';

const MIN_JUSTIFICATION = 20;
const usd = (cents) => Number(centsToNumeric(cents));
const round2 = (n) => Math.round(n * 100) / 100;

const TENDER_COLS = `t.tender_id, t.reference, t.project_id, t.line_id, t.title, t.scope, t.estimate_usd, t.price_weight,
  t.technical_weight, t.min_technical_score, t.closing_at, t.status, t.created_by, t.created_at, t.awarded_bid_id,
  t.award_justification, t.awarded_by, t.awarded_at, t.cancel_reason`;
const SUBCONTRACT_COLS = `s.subcontract_id, s.contract_no, s.project_id, s.line_id, s.subcontractor_id, s.tender_id, s.scope,
  s.original_value_usd, s.retention_percent, s.payment_terms_days, s.defects_liability_months, s.start_date::text AS start_date,
  s.end_date::text AS end_date, s.status, s.created_by, s.created_at`;
const CLAIM_COLS = `c.claim_id, c.subcontract_id, c.claim_no, c.period_end::text AS period_end, c.claimed_cumulative_usd, c.status,
  c.submitted_by, c.submitted_at, c.certified_cumulative_usd, c.previous_certified_usd, c.gross_this_period_usd,
  c.retention_this_period_usd, c.net_payable_usd, c.payment_due_date::text AS payment_due_date, c.certified_by, c.certified_at,
  c.rejection_reason, c.paid_reference, c.paid_by, c.paid_at`;

/** A subcontractor user acts only for their own firm; PM / QS staff act for any firm. */
const actsAsSubcontractor = (user) => hasRole(user, ROLES.SUBCONTRACTOR) && !hasRole(user, ROLES.PROJECT_MANAGER, ROLES.QUANTITY_SURVEYOR);

/**
 * Weighted evaluation. Bids are non-compliant if the firm is suspended, has no valid tax clearance on the
 * closing date, or scores below the technical threshold. Price scores are relative to the lowest compliant
 * price (lowest = 100); the combined score ranks the compliant bids.
 */
export function evaluateBids(tender, bids) {
  const closingDay = todayHarare(new Date(tender.closing_at));
  const minTech = Number(tender.min_technical_score);
  const assessed = bids.map((b) => {
    const reasons = [];
    if (b.subcontractor_status !== 'ACTIVE') reasons.push('Subcontractor is suspended');
    if (!b.tax_clearance_expiry || b.tax_clearance_expiry < closingDay) reasons.push('No valid tax clearance at tender closing');
    if (b.technical_score === null || b.technical_score === undefined) reasons.push('Not yet technically scored');
    else if (Number(b.technical_score) < minTech) reasons.push(`Technical score below the ${minTech} threshold`);
    return { ...b, reasons };
  });
  const compliant = assessed.filter((b) => b.reasons.length === 0);
  const lowest = compliant.length ? Math.min(...compliant.map((b) => Number(b.amount_usd))) : null;
  const scored = assessed.map((b) => {
    if (b.reasons.length) return { ...b, compliant: false, price_score: null, combined_score: null, rank: null };
    const price = round2((lowest / Number(b.amount_usd)) * 100);
    const combined = round2((tender.price_weight * price + tender.technical_weight * Number(b.technical_score)) / 100);
    return { ...b, compliant: true, price_score: price, combined_score: combined };
  });
  const ranked = scored.filter((b) => b.compliant).sort((a, b) =>
    b.combined_score - a.combined_score || Number(a.amount_usd) - Number(b.amount_usd) || new Date(a.submitted_at) - new Date(b.submitted_at));
  ranked.forEach((b, i) => { b.rank = i + 1; });
  return {
    complete: assessed.every((b) => b.technical_score !== null && b.technical_score !== undefined),
    lowestCompliantUsd: lowest,
    recommendedBidId: ranked[0]?.bid_id ?? null,
    bids: [...ranked, ...scored.filter((b) => !b.compliant)].map(({ reasons, ...b }) => ({ ...b, non_compliance: reasons })),
  };
}

export class TenderService {
  constructor(db) {
    this.db = db;
  }

  // ------------------------------------------------------------------------------------------ subcontractors

  async listSubcontractors() {
    const today = todayHarare();
    const { rows } = await this.db.query(
      `SELECT sc.subcontractor_id, sc.name, sc.registration_no, sc.trade, sc.contact_phone, sc.email,
              sc.tax_clearance_expiry::text AS tax_clearance_expiry, sc.user_sub, sc.status, sc.created_at,
              (SELECT count(*)::int FROM subcontracts s WHERE s.subcontractor_id = sc.subcontractor_id AND s.status = 'ACTIVE') AS active_subcontracts
         FROM subcontractors sc ORDER BY sc.name`);
    return rows.map((s) => ({ ...s, tax_clearance_valid: !!s.tax_clearance_expiry && s.tax_clearance_expiry >= today }));
  }

  async createSubcontractor(body, actor) {
    const b = body ?? {};
    return this.db.tx(async (client) => {
      const { rows: [s] } = await client.query(
        `INSERT INTO subcontractors (name, registration_no, trade, contact_phone, email, tax_clearance_expiry, user_sub)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING subcontractor_id, name, registration_no, trade, contact_phone, email, tax_clearance_expiry::text AS tax_clearance_expiry, user_sub, status`,
        [f.text(b.name, 'name', { max: 200 }), f.text(b.registrationNo, 'registrationNo', { max: 60 }), f.text(b.trade, 'trade', { max: 100 }),
          f.text(b.contactPhone, 'contactPhone', { max: 30 }), f.text(b.email, 'email', { optional: true, max: 200 }),
          f.date(b.taxClearanceExpiry, 'taxClearanceExpiry', { optional: true }), f.text(b.userSub, 'userSub', { optional: true, max: 200 })]);
      await audit(client, actor, 'SUBCONTRACTOR_REGISTERED', 'subcontractors', s.subcontractor_id, { name: s.name, registrationNo: s.registration_no });
      return s;
    });
  }

  async updateSubcontractor(id, body, actor) {
    f.uuid(id, 'subcontractorId');
    const b = body ?? {};
    const status = f.oneOf(b.status, 'status', ['ACTIVE', 'SUSPENDED'], { optional: true });
    const expiry = f.date(b.taxClearanceExpiry, 'taxClearanceExpiry', { optional: true });
    if (!status && !expiry) throw badRequest('INVALID_FIELD', 'Give status and/or taxClearanceExpiry');
    return this.db.tx(async (client) => {
      const { rows: [s] } = await client.query(
        `UPDATE subcontractors SET status = COALESCE($2, status), tax_clearance_expiry = COALESCE($3::date, tax_clearance_expiry)
          WHERE subcontractor_id = $1
          RETURNING subcontractor_id, name, status, tax_clearance_expiry::text AS tax_clearance_expiry`, [id, status, expiry]);
      if (!s) throw notFound('Subcontractor');
      await audit(client, actor, 'SUBCONTRACTOR_UPDATED', 'subcontractors', id, { status, taxClearanceExpiry: expiry });
      return s;
    });
  }

  async #ownFirm(client, user) {
    const { rows: [s] } = await client.query('SELECT subcontractor_id FROM subcontractors WHERE user_sub = $1', [user.sub]);
    if (!s) throw forbidden('NOT_LINKED', 'Your sign-in is not linked to a registered subcontractor');
    return s.subcontractor_id;
  }

  // ------------------------------------------------------------------------------------------ tenders

  async createTender(projectId, body, actor) {
    const b = body ?? {};
    f.uuid(projectId, 'projectId');
    const closing = new Date(b.closingAt ?? '');
    if (Number.isNaN(closing.getTime())) throw badRequest('INVALID_FIELD', 'closingAt must be an ISO-8601 date-time');
    if (closing.getTime() <= Date.now()) throw badRequest('INVALID_FIELD', 'closingAt must be in the future');
    const priceWeight = f.int(b.priceWeight, 'priceWeight', { min: 0, max: 100, fallback: 70 });
    const technicalWeight = f.int(b.technicalWeight, 'technicalWeight', { min: 0, max: 100, fallback: 100 - priceWeight });
    if (priceWeight + technicalWeight !== 100) throw badRequest('INVALID_WEIGHTS', 'priceWeight + technicalWeight must equal 100');
    return this.db.tx(async (client) => {
      const { rows: [p] } = await client.query('SELECT status FROM construction_projects WHERE project_id = $1', [projectId]);
      if (!p) throw notFound('Project');
      if (['COMPLETED', 'CLOSED'].includes(p.status)) throw conflict('PROJECT_CLOSED', `Cannot tender on a ${p.status} project`);
      const { rows: [line] } = await client.query('SELECT category FROM project_budget_lines WHERE line_id = $1 AND project_id = $2',
        [f.uuid(b.lineId, 'lineId'), projectId]);
      if (!line) throw notFound('Budget line on this project');
      if (line.category !== 'SUBCONTRACT') throw badRequest('LINE_NOT_SUBCONTRACT', 'Tenders must be charged to a SUBCONTRACT cost line');
      const { rows: [t] } = await client.query(
        `INSERT INTO tenders AS t (reference, project_id, line_id, title, scope, estimate_usd, price_weight, technical_weight,
                                   min_technical_score, closing_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${TENDER_COLS}`,
        [f.code(b.reference, 'reference'), projectId, b.lineId, f.text(b.title, 'title', { max: 200 }), f.text(b.scope, 'scope', { max: 5000 }),
          f.usdAmount(b.estimateUsd), priceWeight, technicalWeight,
          f.decimal(b.minTechnicalScore, 'minTechnicalScore', { min: 0, max: 100, fallback: '60' }), closing.toISOString(), actor]);
      await audit(client, actor, 'TENDER_ISSUED', 'tenders', t.tender_id, { reference: t.reference, closingAt: t.closing_at });
      return t;
    });
  }

  async listTenders({ projectId, status } = {}, user) {
    const own = actsAsSubcontractor(user) ? await this.#ownFirm(this.db, user) : null;
    const { rows } = await this.db.query(
      `SELECT ${TENDER_COLS}, p.code AS project_code, p.name AS project_name, l.cost_code,
              (SELECT count(*)::int FROM tender_bids b WHERE b.tender_id = t.tender_id) AS bid_count,
              ($4::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM tender_bids b WHERE b.tender_id = t.tender_id AND b.subcontractor_id = $4::uuid)) AS my_bid
         FROM tenders t JOIN construction_projects p ON p.project_id = t.project_id
         JOIN project_budget_lines l ON l.line_id = t.line_id
        WHERE ($1::uuid IS NULL OR t.project_id = $1::uuid) AND ($2::text IS NULL OR t.status = $2)
          AND ($3::boolean = false OR t.status = 'OPEN'
               OR EXISTS (SELECT 1 FROM tender_bids b WHERE b.tender_id = t.tender_id AND b.subcontractor_id = $4::uuid))
        ORDER BY t.created_at DESC`,
      [f.uuid(projectId, 'projectId', { optional: true }), status || null, own !== null, own]);
    // A subcontractor never sees the engineer's estimate or how many rivals have bid.
    return own ? rows.map(({ estimate_usd, bid_count, ...t }) => t) : rows;
  }

  async #bids(client, tenderId) {
    const { rows } = await client.query(
      `SELECT b.bid_id, b.tender_id, b.subcontractor_id, sc.name AS subcontractor_name, sc.status AS subcontractor_status,
              sc.tax_clearance_expiry::text AS tax_clearance_expiry, b.amount_usd, b.duration_days, b.methodology,
              b.technical_score, b.scored_by, b.scored_at, b.submitted_by, b.submitted_at
         FROM tender_bids b JOIN subcontractors sc ON sc.subcontractor_id = b.subcontractor_id
        WHERE b.tender_id = $1 ORDER BY b.submitted_at`, [tenderId]);
    return rows;
  }

  async #tender(client, tenderId, { lock = false } = {}) {
    f.uuid(tenderId, 'tenderId');
    const { rows: [t] } = await client.query(`SELECT ${TENDER_COLS} FROM tenders t WHERE t.tender_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [tenderId]);
    if (!t) throw notFound('Tender');
    return t;
  }

  /** Bids stay sealed (no prices) while the tender is open. Subcontractors only ever see their own bid. */
  async getTender(tenderId, user) {
    const t = await this.#tender(this.db, tenderId);
    let bids = await this.#bids(this.db, tenderId);
    if (actsAsSubcontractor(user)) {
      const own = await this.#ownFirm(this.db, user);
      const { estimate_usd, ...visible } = t;
      return { tender: visible, bids: bids.filter((b) => b.subcontractor_id === own).map(({ technical_score, scored_by, ...b }) => b), evaluation: null };
    }
    const sealed = t.status === 'OPEN';
    if (sealed) bids = bids.map((b) => ({ ...b, amount_usd: null, duration_days: null, methodology: null }));
    return { tender: t, sealed, bids, evaluation: sealed ? null : evaluateBids(t, bids) };
  }

  async submitBid(tenderId, body, user) {
    const b = body ?? {};
    const amount = f.usdAmount(b.amountUsd);
    const duration = f.int(b.durationDays, 'durationDays', { min: 1, max: 3650 });
    const methodology = f.text(b.methodology, 'methodology', { optional: true, max: 5000 });
    return this.db.tx(async (client) => {
      await this.#tender(client, tenderId);
      const firmId = actsAsSubcontractor(user) ? await this.#ownFirm(client, user) : f.uuid(b.subcontractorId, 'subcontractorId');
      const { rows: [sc] } = await client.query('SELECT status FROM subcontractors WHERE subcontractor_id = $1', [firmId]);
      if (!sc) throw notFound('Subcontractor');
      if (sc.status !== 'ACTIVE') throw conflict('SUBCONTRACTOR_SUSPENDED', 'Suspended subcontractors cannot bid');
      const { rows: [bid] } = await client.query(
        `INSERT INTO tender_bids (tender_id, subcontractor_id, amount_usd, duration_days, methodology, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING bid_id, tender_id, subcontractor_id, amount_usd, duration_days, submitted_at`,
        [tenderId, firmId, amount, duration, methodology, user.sub]);
      await audit(client, user.sub, 'BID_SUBMITTED', 'tender_bids', bid.bid_id, { tenderId, subcontractorId: firmId });
      return bid;
    });
  }

  /** Opens the sealed bids for evaluation. Allowed only once the advertised closing time has passed. */
  async closeTender(tenderId, actor) {
    return this.db.tx(async (client) => {
      const t = await this.#tender(client, tenderId, { lock: true });
      if (t.status !== 'OPEN') throw conflict('TENDER_NOT_OPEN', `Tender is ${t.status}`);
      if (new Date(t.closing_at).getTime() > Date.now()) {
        throw conflict('TENDER_STILL_OPEN', `Bids are sealed until ${new Date(t.closing_at).toISOString()}`);
      }
      await client.query(`UPDATE tenders SET status = 'EVALUATION' WHERE tender_id = $1`, [tenderId]);
      const { rows: [n] } = await client.query('SELECT count(*)::int AS bids FROM tender_bids WHERE tender_id = $1', [tenderId]);
      await audit(client, actor, 'TENDER_OPENED_FOR_EVALUATION', 'tenders', tenderId, { bids: n.bids });
      return { tender_id: tenderId, status: 'EVALUATION', bids: n.bids };
    });
  }

  async scoreBid(tenderId, bidId, body, actor) {
    const score = f.decimal(body?.technicalScore, 'technicalScore', { min: 0, max: 100 });
    f.uuid(bidId, 'bidId');
    return this.db.tx(async (client) => {
      await this.#tender(client, tenderId);
      const { rows: [b] } = await client.query(
        `UPDATE tender_bids SET technical_score = $3, scored_by = $4, scored_at = now()
          WHERE bid_id = $1 AND tender_id = $2 RETURNING bid_id, technical_score, scored_by, scored_at`, [bidId, tenderId, score, actor]);
      if (!b) throw notFound('Bid on this tender');
      await audit(client, actor, 'BID_SCORED', 'tender_bids', bidId, { technicalScore: score });
      return b;
    });
  }

  /**
   * Awards the tender and creates the subcontract at the bid price. Awarding anything other than the
   * top-ranked compliant bid needs a written justification; non-compliant bids can never be awarded.
   */
  async awardTender(tenderId, body, actor) {
    const b = body ?? {};
    const bidId = f.uuid(b.bidId, 'bidId');
    const startDate = f.date(b.startDate, 'startDate');
    const retention = f.decimal(b.retentionPercent, 'retentionPercent', { min: 0, max: 20, fallback: '5' });
    const terms = f.int(b.paymentTermsDays, 'paymentTermsDays', { min: 0, max: 120, fallback: 30 });
    const dlp = f.int(b.defectsLiabilityMonths, 'defectsLiabilityMonths', { min: 0, max: 60, fallback: 12 });
    const justification = f.text(b.justification, 'justification', { optional: true, max: 2000 });
    return this.db.tx(async (client) => {
      const t = await this.#tender(client, tenderId, { lock: true });
      if (t.status !== 'EVALUATION') throw conflict('TENDER_NOT_IN_EVALUATION', `Only tenders in evaluation can be awarded (this one is ${t.status})`);
      const evaluation = evaluateBids(t, await this.#bids(client, tenderId));
      if (!evaluation.complete) throw conflict('EVALUATION_INCOMPLETE', 'Every bid must be technically scored before award');
      const bid = evaluation.bids.find((x) => x.bid_id === bidId);
      if (!bid) throw notFound('Bid on this tender');
      if (!bid.compliant) throw conflict('BID_NOT_COMPLIANT', `Cannot award a non-compliant bid: ${bid.non_compliance.join('; ')}`);
      if (bid.rank !== 1 && (!justification || justification.length < MIN_JUSTIFICATION)) {
        throw badRequest('JUSTIFICATION_REQUIRED', `This bid ranks #${bid.rank}; awarding it needs a justification of at least ${MIN_JUSTIFICATION} characters`);
      }
      const { rows: [p] } = await client.query('SELECT code FROM construction_projects WHERE project_id = $1 FOR UPDATE', [t.project_id]);
      const { rows: [n] } = await client.query('SELECT count(*)::int + 1 AS n FROM subcontracts WHERE project_id = $1', [t.project_id]);
      const endDate = b.endDate ? f.date(b.endDate, 'endDate') : addDays(startDate, bid.duration_days);
      if (endDate < startDate) throw badRequest('INVALID_FIELD', 'endDate must be on or after startDate');

      await client.query(
        `UPDATE tenders SET status = 'AWARDED', awarded_bid_id = $2, award_justification = $3, awarded_by = $4, awarded_at = now()
          WHERE tender_id = $1`, [tenderId, bidId, justification, actor]);
      const { rows: [s] } = await client.query(
        `INSERT INTO subcontracts AS s (contract_no, project_id, line_id, subcontractor_id, tender_id, scope, original_value_usd,
                                        retention_percent, payment_terms_days, defects_liability_months, start_date, end_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${SUBCONTRACT_COLS}`,
        [`SC-${p.code}-${String(n.n).padStart(3, '0')}`, t.project_id, t.line_id, bid.subcontractor_id, tenderId, t.scope,
          bid.amount_usd, retention, terms, dlp, startDate, endDate, actor]);

      // Warn (do not block) when the award takes the cost line past its budget.
      const { rows: [line] } = await client.query(
        `SELECT l.original_budget_usd + COALESCE((SELECT sum(amount_usd) FROM budget_adjustments a WHERE a.line_id = l.line_id), 0) AS revised,
                COALESCE((SELECT sum(x.original_value_usd + COALESCE((SELECT sum(v.amount_usd) FROM subcontract_variations v
                                                                      WHERE v.subcontract_id = x.subcontract_id), 0))
                            FROM subcontracts x WHERE x.line_id = l.line_id AND x.status = 'ACTIVE'), 0) AS committed
           FROM project_budget_lines l WHERE l.line_id = $1`, [t.line_id]);
      const over = numericToCents(line.committed) - numericToCents(line.revised);
      await audit(client, actor, 'TENDER_AWARDED', 'tenders', tenderId, {
        bidId, subcontractId: s.subcontract_id, value: bid.amount_usd, rank: bid.rank, justification,
      });
      return {
        subcontract: s,
        rank: bid.rank,
        budgetWarning: over > 0 ? `Commitments on this cost line now exceed its budget by $${centsToNumeric(over)}` : null,
      };
    });
  }

  async cancelTender(tenderId, body, actor) {
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 1000 });
    return this.db.tx(async (client) => {
      const t = await this.#tender(client, tenderId, { lock: true });
      if (!['OPEN', 'EVALUATION'].includes(t.status)) throw conflict('TENDER_NOT_CANCELLABLE', `Tender is ${t.status}`);
      await client.query(`UPDATE tenders SET status = 'CANCELLED', cancel_reason = $2 WHERE tender_id = $1`, [tenderId, reason]);
      await audit(client, actor, 'TENDER_CANCELLED', 'tenders', tenderId, { reason });
      return { tender_id: tenderId, status: 'CANCELLED' };
    });
  }

  // ------------------------------------------------------------------------------------------ subcontracts

  async listSubcontracts({ projectId } = {}, user) {
    const own = actsAsSubcontractor(user) ? await this.#ownFirm(this.db, user) : null;
    const { rows } = await this.db.query(
      `SELECT ${SUBCONTRACT_COLS}, sc.name AS subcontractor_name, p.code AS project_code, p.name AS project_name, l.cost_code,
              s.original_value_usd + COALESCE((SELECT sum(amount_usd) FROM subcontract_variations v WHERE v.subcontract_id = s.subcontract_id), 0) AS revised_value_usd,
              COALESCE((SELECT max(certified_cumulative_usd) FROM subcontract_claims c WHERE c.subcontract_id = s.subcontract_id AND c.status IN ('CERTIFIED','PAID')), 0) AS certified_to_date_usd,
              COALESCE((SELECT sum(retention_this_period_usd) FROM subcontract_claims c WHERE c.subcontract_id = s.subcontract_id AND c.status IN ('CERTIFIED','PAID')), 0) AS retention_held_usd,
              COALESCE((SELECT sum(net_payable_usd) FROM subcontract_claims c WHERE c.subcontract_id = s.subcontract_id AND c.status = 'PAID'), 0) AS paid_to_date_usd,
              (SELECT count(*)::int FROM subcontract_claims c WHERE c.subcontract_id = s.subcontract_id AND c.status = 'SUBMITTED') AS claims_awaiting_certification
         FROM subcontracts s JOIN subcontractors sc ON sc.subcontractor_id = s.subcontractor_id
         JOIN construction_projects p ON p.project_id = s.project_id
         JOIN project_budget_lines l ON l.line_id = s.line_id
        WHERE ($1::uuid IS NULL OR s.project_id = $1::uuid) AND ($2::uuid IS NULL OR s.subcontractor_id = $2::uuid)
        ORDER BY s.created_at DESC`, [f.uuid(projectId, 'projectId', { optional: true }), own]);
    return rows;
  }

  async getSubcontract(subcontractId, user) {
    f.uuid(subcontractId, 'subcontractId');
    const [s] = (await this.db.query(
      `SELECT ${SUBCONTRACT_COLS}, sc.name AS subcontractor_name, sc.user_sub, p.code AS project_code, p.name AS project_name, l.cost_code
         FROM subcontracts s JOIN subcontractors sc ON sc.subcontractor_id = s.subcontractor_id
         JOIN construction_projects p ON p.project_id = s.project_id JOIN project_budget_lines l ON l.line_id = s.line_id
        WHERE s.subcontract_id = $1`, [subcontractId])).rows;
    if (!s) throw notFound('Subcontract');
    if (actsAsSubcontractor(user) && s.user_sub !== user.sub) throw forbidden('FORBIDDEN', 'You can only view your own subcontracts');
    const { user_sub, ...subcontract } = s;
    const { rows: variations } = await this.db.query(
      'SELECT * FROM subcontract_variations WHERE subcontract_id = $1 ORDER BY created_at', [subcontractId]);
    const { rows: claims } = await this.db.query(`SELECT ${CLAIM_COLS} FROM subcontract_claims c WHERE c.subcontract_id = $1 ORDER BY c.claim_no`, [subcontractId]);

    const today = todayHarare();
    const cents = (rows, k, pred = () => true) => rows.filter(pred).reduce((t, r) => t + numericToCents(r[k] ?? 0), 0);
    const certifiedRows = (c) => ['CERTIFIED', 'PAID'].includes(c.status);
    const revised = numericToCents(s.original_value_usd) + cents(variations, 'amount_usd');
    const certified = Math.max(0, ...claims.filter(certifiedRows).map((c) => numericToCents(c.certified_cumulative_usd)));
    return {
      subcontract,
      variations,
      claims: claims.map((c) => ({ ...c, overdue: c.status === 'CERTIFIED' && c.payment_due_date < today })),
      totals: {
        original_value_usd: usd(numericToCents(s.original_value_usd)),
        variations_usd: usd(cents(variations, 'amount_usd')),
        revised_value_usd: usd(revised),
        certified_to_date_usd: usd(certified),
        remaining_value_usd: usd(revised - certified),
        retention_held_usd: usd(cents(claims, 'retention_this_period_usd', certifiedRows)),
        paid_to_date_usd: usd(cents(claims, 'net_payable_usd', (c) => c.status === 'PAID')),
        certified_unpaid_usd: usd(cents(claims, 'net_payable_usd', (c) => c.status === 'CERTIFIED')),
        percent_certified: revised > 0 ? Math.round((certified / revised) * 1000) / 10 : 0,
      },
    };
  }

  async addVariation(subcontractId, body, actor) {
    f.uuid(subcontractId, 'subcontractId');
    const amount = f.signedUsd(body?.amountUsd);
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 2000 });
    return this.db.tx(async (client) => {
      const { rows: [s] } = await client.query('SELECT status FROM subcontracts WHERE subcontract_id = $1', [subcontractId]);
      if (!s) throw notFound('Subcontract');
      if (s.status !== 'ACTIVE') throw conflict('SUBCONTRACT_NOT_ACTIVE', `Subcontract is ${s.status}`);
      const { rows: [v] } = await client.query(
        'INSERT INTO subcontract_variations (subcontract_id, amount_usd, reason, approved_by) VALUES ($1,$2,$3,$4) RETURNING *',
        [subcontractId, amount, reason, actor]);
      await audit(client, actor, 'VARIATION_APPROVED', 'subcontracts', subcontractId, { amount, reason });
      return v;
    });
  }

  async setSubcontractStatus(subcontractId, status, actor) {
    f.uuid(subcontractId, 'subcontractId');
    const next = f.oneOf(status, 'status', ['COMPLETED', 'TERMINATED']);
    return this.db.tx(async (client) => {
      const { rows: [s] } = await client.query('SELECT status FROM subcontracts WHERE subcontract_id = $1 FOR UPDATE', [subcontractId]);
      if (!s) throw notFound('Subcontract');
      if (s.status !== 'ACTIVE') throw conflict('SUBCONTRACT_NOT_ACTIVE', `Subcontract is already ${s.status}`);
      const { rowCount } = await client.query(`SELECT 1 FROM subcontract_claims WHERE subcontract_id = $1 AND status = 'SUBMITTED'`, [subcontractId]);
      if (rowCount) throw conflict('CLAIM_ALREADY_OPEN', 'Certify or reject the open claim first');
      await client.query('UPDATE subcontracts SET status = $2 WHERE subcontract_id = $1', [subcontractId, next]);
      await audit(client, actor, 'SUBCONTRACT_STATUS_CHANGED', 'subcontracts', subcontractId, { from: s.status, to: next });
      return { subcontract_id: subcontractId, status: next };
    });
  }

  // ------------------------------------------------------------------------------------------ progress claims

  /** Claims are cumulative (total work done to date), the usual valuation basis for interim payments. */
  async submitClaim(subcontractId, body, user) {
    f.uuid(subcontractId, 'subcontractId');
    const periodEnd = f.date(body?.periodEnd, 'periodEnd');
    if (periodEnd > todayHarare()) throw badRequest('INVALID_FIELD', 'periodEnd cannot be in the future');
    const claimed = f.usdAmount(body?.claimedCumulativeUsd);
    return this.db.tx(async (client) => {
      const { rows: [s] } = await client.query(
        `SELECT s.status, sc.user_sub FROM subcontracts s JOIN subcontractors sc ON sc.subcontractor_id = s.subcontractor_id
          WHERE s.subcontract_id = $1 FOR UPDATE OF s`, [subcontractId]);
      if (!s) throw notFound('Subcontract');
      if (actsAsSubcontractor(user) && s.user_sub !== user.sub) throw forbidden('FORBIDDEN', 'You can only claim on your own subcontracts');
      if (s.status !== 'ACTIVE') throw conflict('SUBCONTRACT_NOT_ACTIVE', `Subcontract is ${s.status}`);
      const { rows: [prev] } = await client.query(
        `SELECT COALESCE(max(certified_cumulative_usd) FILTER (WHERE status IN ('CERTIFIED','PAID')), 0) AS certified,
                COALESCE(max(claim_no), 0) + 1 AS next_no
           FROM subcontract_claims WHERE subcontract_id = $1`, [subcontractId]);
      if (numericToCents(claimed) <= numericToCents(prev.certified)) {
        throw badRequest('CLAIM_NOT_ABOVE_CERTIFIED', `The cumulative claim must exceed the $${prev.certified} already certified`);
      }
      const { rows: [c] } = await client.query(
        `INSERT INTO subcontract_claims AS c (subcontract_id, claim_no, period_end, claimed_cumulative_usd, submitted_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING ${CLAIM_COLS}`, [subcontractId, prev.next_no, periodEnd, claimed, user.sub]);
      await audit(client, user.sub, 'CLAIM_SUBMITTED', 'subcontract_claims', c.claim_id, { subcontractId, claimNo: c.claim_no, claimed });
      return c;
    });
  }

  /**
   * The QS certifies the value of work actually done (up to the amount claimed). This period's gross value
   * is posted to the job cost ledger; retention is withheld and the net falls due after the payment terms.
   */
  async certifyClaim(claimId, body, actor) {
    f.uuid(claimId, 'claimId');
    const certified = f.usdAmount(body?.certifiedCumulativeUsd);
    return this.db.tx(async (client) => {
      const { rows: [c] } = await client.query(
        `SELECT c.*, s.project_id, s.line_id, s.retention_percent, s.payment_terms_days, s.contract_no
           FROM subcontract_claims c JOIN subcontracts s ON s.subcontract_id = c.subcontract_id
          WHERE c.claim_id = $1 FOR UPDATE OF c`, [claimId]);
      if (!c) throw notFound('Claim');
      if (c.status !== 'SUBMITTED') throw conflict('CLAIM_NOT_SUBMITTED', `Claim is ${c.status}`);
      if (c.submitted_by === actor) throw forbidden('SEGREGATION_OF_DUTIES', 'A claim cannot be certified by the person who submitted it');
      const certCents = numericToCents(certified);
      if (certCents > numericToCents(c.claimed_cumulative_usd)) {
        throw badRequest('CERTIFIED_ABOVE_CLAIM', `Cannot certify more than the $${c.claimed_cumulative_usd} claimed`);
      }
      const { rows: [prev] } = await client.query(
        `SELECT COALESCE(max(certified_cumulative_usd), 0) AS certified FROM subcontract_claims
          WHERE subcontract_id = $1 AND status IN ('CERTIFIED','PAID')`, [c.subcontract_id]);
      const prevCents = numericToCents(prev.certified);
      const gross = certCents - prevCents;
      if (gross < 0) throw badRequest('CERTIFIED_BELOW_PREVIOUS', `Cumulative certificate cannot be below the previous $${prev.certified}`);
      const retention = Math.round((gross * Number(c.retention_percent)) / 100);
      const today = todayHarare();
      const { rows: [u] } = await client.query(
        `UPDATE subcontract_claims c SET status = 'CERTIFIED', certified_cumulative_usd = $2, previous_certified_usd = $3,
                gross_this_period_usd = $4, retention_this_period_usd = $5, net_payable_usd = $6, payment_due_date = $7,
                certified_by = $8, certified_at = now()
          WHERE claim_id = $1 RETURNING ${CLAIM_COLS}`,
        [claimId, certified, centsToNumeric(prevCents), centsToNumeric(gross), centsToNumeric(retention),
          centsToNumeric(gross - retention), addDays(today, c.payment_terms_days), actor]);
      if (gross > 0) {
        await insertCostEntry(client, {
          projectId: c.project_id, lineId: c.line_id, source: 'SUBCONTRACT_CERTIFICATE', entryDate: today,
          description: `${c.contract_no} certificate #${c.claim_no}`, quantity: '1', unit: 'CERT',
          unitRate: centsToNumeric(gross), claimId, recordedBy: actor,
        });
      }
      await audit(client, actor, 'CLAIM_CERTIFIED', 'subcontract_claims', claimId, {
        certified, gross: centsToNumeric(gross), retention: centsToNumeric(retention),
      });
      return u;
    });
  }

  async rejectClaim(claimId, body, actor) {
    f.uuid(claimId, 'claimId');
    const reason = f.text(body?.reason, 'reason', { min: 5, max: 2000 });
    return this.db.tx(async (client) => {
      const { rows: [c] } = await client.query(
        `UPDATE subcontract_claims c SET status = 'REJECTED', rejection_reason = $2, certified_by = $3, certified_at = now()
          WHERE claim_id = $1 AND status = 'SUBMITTED' RETURNING ${CLAIM_COLS}`, [claimId, reason, actor]);
      if (!c) throw conflict('CLAIM_NOT_SUBMITTED', 'Only a submitted claim can be rejected');
      await audit(client, actor, 'CLAIM_REJECTED', 'subcontract_claims', claimId, { reason });
      return c;
    });
  }

  async payClaim(claimId, body, actor) {
    f.uuid(claimId, 'claimId');
    const ref = f.text(body?.paymentReference, 'paymentReference', { max: 100 });
    return this.db.tx(async (client) => {
      const { rows: [c] } = await client.query(
        `UPDATE subcontract_claims c SET status = 'PAID', paid_reference = $2, paid_by = $3, paid_at = now()
          WHERE claim_id = $1 AND status = 'CERTIFIED' RETURNING ${CLAIM_COLS}`, [claimId, ref, actor]);
      if (!c) throw conflict('CLAIM_NOT_CERTIFIED', 'Only a certified, unpaid claim can be paid');
      await audit(client, actor, 'CLAIM_PAID', 'subcontract_claims', claimId, { paymentReference: ref, net: c.net_payable_usd });
      return c;
    });
  }
}
