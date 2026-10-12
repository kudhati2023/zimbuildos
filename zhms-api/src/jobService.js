import { audit } from './db.js';
import { notFound } from './errors.js';
import { todayHarare, addDays } from './dates.js';
import { numericToCents } from './money.js';
import { planPosition } from './instalments.js';
import { enqueueMessage, usd } from './messaging.js';

/**
 * Scheduled work. Every job is idempotent (dedupe keys on messages, status guards on instalments),
 * so running it twice, or from two servers at once, never double-charges or double-messages anyone.
 */
export class JobService {
  constructor(db, { allocation, dispatcher }) {
    this.db = db;
    this.allocation = allocation;
    this.dispatcher = dispatcher;
  }

  /** Instalments unpaid after due date + grace days become OVERDUE and the buyer is told once. */
  async markOverdue(today = todayHarare()) {
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `UPDATE plan_installments i SET status = 'OVERDUE'
           FROM payment_plans p
           JOIN allocations a ON a.allocation_id = p.allocation_id
           JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
          WHERE i.plan_id = p.plan_id
            AND a.status = 'ACTIVE'
            AND i.status IN ('DUE','PARTIAL')
            AND i.due_date + p.grace_days < $1::date
        RETURNING i.installment_id, i.due_date::text AS due_date,
                  (i.principal_usd + i.interest_usd - i.paid_usd) AS owed,
                  a.subject_id, a.account_ref, s.stand_number`, [today]);
      for (const r of rows) {
        await enqueueMessage(client, {
          subjectId: r.subject_id,
          template: 'PAYMENT_OVERDUE',
          dedupeKey: `overdue:${r.installment_id}`,
          params: { amount: usd(numericToCents(r.owed)), stand: r.stand_number, due: r.due_date, ref: r.account_ref },
        });
      }
      if (rows.length) {
        await audit(client, 'system:jobs', 'INSTALMENTS_MARKED_OVERDUE', 'plan_installments', today, {
          count: rows.length, installmentIds: rows.map((r) => r.installment_id),
        });
      }
      return rows.length;
    });
  }

  /** One reminder per instalment, sent when it falls due within reminder_days_before days. */
  async queueReminders(today = todayHarare()) {
    return this.db.tx(async (client) => {
      const { rows: [cfg] } = await client.query(`SELECT value::int AS days FROM app_config WHERE key = 'reminder_days_before'`);
      const { rows } = await client.query(
        `SELECT i.installment_id, i.due_date::text AS due_date,
                (i.principal_usd + i.interest_usd - i.paid_usd) AS owed,
                a.allocation_id, a.subject_id, a.account_ref, s.stand_number
           FROM plan_installments i
           JOIN payment_plans p ON p.plan_id = i.plan_id
           JOIN allocations a ON a.allocation_id = p.allocation_id
           JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
          WHERE a.status = 'ACTIVE'
            AND i.status IN ('DUE','PARTIAL')
            AND i.due_date BETWEEN $1::date AND $2::date`, [today, addDays(today, cfg?.days ?? 3)]);
      let queued = 0;
      for (const r of rows) {
        const position = await planPosition(client, r.allocation_id);
        const id = await enqueueMessage(client, {
          subjectId: r.subject_id,
          template: 'PAYMENT_REMINDER',
          dedupeKey: `reminder:${r.installment_id}`,
          params: {
            amount: usd(numericToCents(r.owed)),
            stand: r.stand_number,
            due: r.due_date,
            ref: r.account_ref,
            balance: usd(position.outstandingCents),
          },
        });
        if (id) queued += 1;
      }
      return queued;
    });
  }

  /** Monthly statements on the 1st (or any day with force), one per active plan per month. */
  async queueStatements(today = todayHarare(), { force = false } = {}) {
    if (!force && !today.endsWith('-01')) return 0;
    const month = today.slice(0, 7);
    return this.db.tx(async (client) => {
      const { rows } = await client.query(
        `SELECT a.allocation_id FROM allocations a JOIN payment_plans p ON p.allocation_id = a.allocation_id
          WHERE a.status = 'ACTIVE'`);
      let queued = 0;
      for (const r of rows) {
        if (await this.queueStatementFor(client, r.allocation_id, `statement:${r.allocation_id}:${month}`, month)) queued += 1;
      }
      return queued;
    });
  }

  /** Statement for one allocation right now (e.g. a buyer asks finance for one). */
  async sendStatementNow(allocationId, actor) {
    return this.db.tx(async (client) => {
      const id = await this.queueStatementFor(client, allocationId, null, todayHarare().slice(0, 7));
      await audit(client, actor, 'STATEMENT_SENT', 'allocations', allocationId, { messageId: id });
      return id;
    });
  }

  async queueStatementFor(client, allocationId, dedupeKey, month) {
    const { rows: [a] } = await client.query(
      `SELECT a.subject_id, a.account_ref, s.stand_number, b.paid_usd, b.balance_usd
         FROM allocations a
         JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
         JOIN allocation_balances b ON b.allocation_id = a.allocation_id
        WHERE a.allocation_id = $1`, [allocationId]);
    if (!a) throw notFound('Allocation');
    const position = await planPosition(client, allocationId);
    const outstanding = position ? position.outstandingCents : Math.max(0, numericToCents(a.balance_usd));
    return enqueueMessage(client, {
      subjectId: a.subject_id,
      template: 'MONTHLY_STATEMENT',
      dedupeKey,
      params: {
        month,
        stand: a.stand_number,
        paid: usd(numericToCents(a.paid_usd)),
        balance: usd(outstanding),
        next_amount: position?.next ? usd(position.next.amountCents) : 'none',
        next_due: position?.next ? position.next.dueDate : 'n/a',
        ref: a.account_ref,
      },
    });
  }

  /** Everything, in dependency order. Used by the in-process scheduler and POST /admin/jobs/run. */
  async runAll({ today = todayHarare() } = {}) {
    const expiredReservations = (await this.allocation.releaseExpiredReservations()).length;
    const overdue = await this.markOverdue(today);
    const reminders = await this.queueReminders(today);
    const statements = await this.queueStatements(today);
    const dispatch = await this.dispatcher.dispatch();
    return { today, expiredReservations, overdue, reminders, statements, dispatch };
  }
}
