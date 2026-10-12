import { badRequest } from './errors.js';
import { buildSchedule } from './schedule.js';
import { numericToCents, centsToNumeric } from './money.js';

const intIn = (value, fallback, min, max, field) => {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < min || v > max) throw badRequest('INVALID_PLAN_TERMS', `${field} must be a whole number between ${min} and ${max}`);
  return v;
};

/** Validates requested plan terms, filling gaps from app_config (business-editable defaults). */
export async function resolvePlanTerms(client, requested = {}) {
  const { rows } = await client.query(
    `SELECT key, value FROM app_config
      WHERE key IN ('instalment_term_months','instalment_monthly_rate_bps','instalment_grace_days')`);
  const cfg = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const termMonths = intIn(requested.termMonths, cfg.instalment_term_months, 1, 120, 'termMonths');
  return {
    termMonths,
    monthlyRateBps: intIn(requested.monthlyRateBps, cfg.instalment_monthly_rate_bps, 0, 1000, 'monthlyRateBps'),
    interestFreeMonths: intIn(requested.interestFreeMonths, 0, 0, termMonths, 'interestFreeMonths'),
    graceDays: intIn(requested.graceDays, cfg.instalment_grace_days, 0, 60, 'graceDays'),
  };
}

/** Creates the plan and its instalments. Plans are immutable once written (DB trigger). */
export async function createPlan(client, { allocationId, financedCents, terms, startDate, createdBy }) {
  const schedule = buildSchedule({
    financedCents,
    termMonths: terms.termMonths,
    monthlyRateBps: terms.monthlyRateBps,
    interestFreeMonths: terms.interestFreeMonths,
    startDate,
  });
  const { rows: [plan] } = await client.query(
    `INSERT INTO payment_plans (allocation_id, financed_usd, term_months, monthly_rate_bps, interest_free_months,
                                grace_days, start_date, effective_annual_rate, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [allocationId, centsToNumeric(financedCents), terms.termMonths, terms.monthlyRateBps, terms.interestFreeMonths,
      terms.graceDays, startDate, schedule.effectiveAnnualRate, createdBy]);

  await client.query(
    `INSERT INTO plan_installments (plan_id, seq, due_date, principal_usd, interest_usd)
     SELECT $1, s.seq, s.due_date, s.principal, s.interest
       FROM unnest($2::int[], $3::date[], $4::numeric[], $5::numeric[]) AS s(seq, due_date, principal, interest)`,
    [plan.plan_id,
      schedule.installments.map((i) => i.seq),
      schedule.installments.map((i) => i.dueDate),
      schedule.installments.map((i) => centsToNumeric(i.principalCents)),
      schedule.installments.map((i) => centsToNumeric(i.interestCents))]);

  return { plan, schedule };
}

/**
 * Applies a confirmed payment to the plan's open instalments, oldest first.
 * Returns { hasPlan, appliedCents, allPaid }. Any excess stays as credit on the ledger.
 */
export async function settleInstalments(client, { allocationId, paymentId, amountCents }) {
  const { rows: open } = await client.query(
    `SELECT i.* FROM plan_installments i JOIN payment_plans p ON p.plan_id = i.plan_id
      WHERE p.allocation_id = $1 AND i.status <> 'PAID'
      ORDER BY i.seq
      FOR UPDATE OF i`, [allocationId]);
  const { rows: planRows } = await client.query('SELECT 1 FROM payment_plans WHERE allocation_id = $1', [allocationId]);
  if (!planRows.length) return { hasPlan: false, appliedCents: 0, allPaid: false };

  let remaining = amountCents;
  let applied = 0;
  let stillOpen = open.length;
  for (const inst of open) {
    if (remaining <= 0) break;
    const due = numericToCents(inst.principal_usd) + numericToCents(inst.interest_usd) - numericToCents(inst.paid_usd);
    const take = Math.min(due, remaining);
    const fullyPaid = take === due;
    await client.query(
      `UPDATE plan_installments
          SET paid_usd = paid_usd + $2::numeric,
              status = CASE WHEN $3 THEN 'PAID' WHEN status = 'OVERDUE' THEN 'OVERDUE' ELSE 'PARTIAL' END,
              paid_at = CASE WHEN $3 THEN now() ELSE paid_at END
        WHERE installment_id = $1`,
      [inst.installment_id, centsToNumeric(take), fullyPaid]);
    await client.query(
      'INSERT INTO installment_settlements (payment_id, installment_id, amount_usd) VALUES ($1, $2, $3)',
      [paymentId, inst.installment_id, centsToNumeric(take)]);
    remaining -= take;
    applied += take;
    if (fullyPaid) stillOpen -= 1;
  }
  return { hasPlan: true, appliedCents: applied, allPaid: stillOpen === 0 };
}

/** The plan, its instalments and what is still owed (including interest) for one allocation. */
export async function planPosition(db, allocationId) {
  const { rows: [plan] } = await db.query('SELECT * FROM payment_plans WHERE allocation_id = $1', [allocationId]);
  if (!plan) return null;
  const { rows: installments } = await db.query(
    `SELECT installment_id, seq, due_date::text AS due_date, principal_usd, interest_usd, paid_usd, status, paid_at
       FROM plan_installments WHERE plan_id = $1 ORDER BY seq`, [plan.plan_id]);
  let outstanding = 0;
  let overdue = 0;
  let next = null;
  for (const i of installments) {
    const owed = numericToCents(i.principal_usd) + numericToCents(i.interest_usd) - numericToCents(i.paid_usd);
    outstanding += owed;
    if (i.status === 'OVERDUE') overdue += owed;
    if (!next && i.status !== 'PAID') next = { seq: i.seq, dueDate: i.due_date, amountCents: owed };
  }
  return { plan, installments, outstandingCents: outstanding, overdueCents: overdue, next };
}
