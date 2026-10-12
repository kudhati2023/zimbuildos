import { badRequest, notFound, conflict } from './errors.js';
import { audit } from './db.js';
import { toCents, centsToNumeric, numericToCents } from './money.js';
import { settleInstalments, planPosition } from './instalments.js';
import { enqueueMessage, usd } from './messaging.js';
import { todayHarare } from './dates.js';

export const PAYMENT_CHANNELS = ['DEBIT_ORDER', 'BANK_TRANSFER', 'ECOCASH', 'OMARI', 'CASH'];

const CHANNEL_ACCOUNTS = {
  BANK_TRANSFER: '1010',
  DEBIT_ORDER: '1020',
  ECOCASH: '1030',
  OMARI: '1040',
  CASH: '1050',
};

/** Latest ZiG rate, refusing one older than app_config.fx_max_age_hours. */
export async function currentZwgRate(client) {
  const { rows } = await client.query(
    `SELECT r.units_per_usd, r.effective_at,
            r.effective_at < now() - make_interval(hours => (SELECT value::int FROM app_config WHERE key = 'fx_max_age_hours')) AS stale
       FROM fx_rates r
      WHERE r.currency = 'ZWG' AND r.effective_at <= now()
      ORDER BY r.effective_at DESC, r.rate_id DESC
      LIMIT 1`);
  if (!rows.length) throw conflict('NO_FX_RATE', 'No ZiG exchange rate has been recorded; finance must record one first');
  if (rows[0].stale) throw conflict('STALE_FX_RATE', 'The latest ZiG exchange rate is out of date; finance must record a current one');
  return rows[0].units_per_usd; // numeric string
}

export class PaymentService {
  constructor(db) {
    this.db = db;
  }

  async recordPayment(args) {
    return this.db.tx((client) => this.recordPaymentWith(client, args));
  }

  /**
   * Records a payment inside the caller's transaction: payment row, balanced journal, instalment
   * settlement, status transition, receipt message and audit block (always last).
   * USD payments pass `amountUsd`; ZiG payments pass `currency: 'ZWG'` and `amount` in ZiG.
   */
  async recordPaymentWith(client, {
    allocationId, channel, amountUsd, amount, currency = 'USD',
    externalReference, recordedBy, notes = null, receivedAt = new Date(),
  }) {
    if (!PAYMENT_CHANNELS.includes(channel)) {
      throw badRequest('INVALID_CHANNEL', `Payment channel must be one of ${PAYMENT_CHANNELS.join(', ')}`);
    }

    let amountCents;
    let amountOriginal = null;
    let fxRate = null;
    if (currency === 'USD') {
      amountCents = toCents(amountUsd ?? amount);
    } else if (currency === 'ZWG') {
      const zwgCents = toCents(amount);
      fxRate = await currentZwgRate(client);
      amountCents = Math.round(zwgCents / Number(fxRate));
      if (amountCents <= 0) throw badRequest('INVALID_AMOUNT', 'Amount is too small to convert to USD');
      amountOriginal = centsToNumeric(zwgCents);
    } else {
      throw badRequest('INVALID_CURRENCY', 'Currency must be USD or ZWG');
    }
    const amountFormatted = centsToNumeric(amountCents);

    // 1. Lock allocation row
    const allocRes = await client.query(
      `SELECT a.*, s.stand_number
         FROM allocations a JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
        WHERE a.allocation_id = $1
        FOR UPDATE OF a`,
      [allocationId]
    );
    if (allocRes.rows.length === 0) throw notFound('Allocation');
    const alloc = allocRes.rows[0];

    if (['EXPIRED', 'RELEASED', 'CANCELLED'].includes(alloc.status)) {
      throw conflict('ALLOCATION_INACTIVE', `Cannot apply payment to allocation in status ${alloc.status}`);
    }

    // 2. Insert payment row (enforces uq_payment_channel_reference uniqueness)
    const payRes = await client.query(
      `INSERT INTO payments (allocation_id, channel, amount_usd, external_reference, received_at, recorded_by, notes,
                             currency, amount_original, fx_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [allocationId, channel, amountFormatted, externalReference, receivedAt, recordedBy, notes,
        currency, amountOriginal, fxRate]
    );
    const payment = payRes.rows[0];

    // 3. Post double-entry balanced journal:
    // Debit the channel's clearing account (asset) / credit the customer stand account (liability).
    const narration = currency === 'ZWG'
      ? `Payment received via ${channel} - Ref ${externalReference} (ZiG ${amountOriginal} @ ${fxRate})`
      : `Payment received via ${channel} - Ref ${externalReference}`;
    const jRes = await client.query(
      'INSERT INTO journal_entries (payment_id, narration) VALUES ($1, $2) RETURNING journal_id',
      [payment.payment_id, narration]
    );
    const journalId = jRes.rows[0].journal_id;
    await client.query(
      'INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES ($1, $2, $3::numeric, 0)',
      [journalId, CHANNEL_ACCOUNTS[channel], amountFormatted]
    );
    await client.query(
      `INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES ($1, '2100', 0, $2::numeric)`,
      [journalId, amountFormatted]
    );

    // 4. Apply to instalments once a plan exists (the plan is created when the agreement is signed).
    const settlement = alloc.status === 'ACTIVE'
      ? await settleInstalments(client, { allocationId, paymentId: payment.payment_id, amountCents })
      : { hasPlan: false, appliedCents: 0, allPaid: false };

    // 5. Status transitions
    const { rows: [bal] } = await client.query('SELECT * FROM allocation_balances WHERE allocation_id = $1', [allocationId]);
    const paidCents = numericToCents(bal.paid_usd);
    const depositCents = numericToCents(alloc.deposit_required_usd);
    const totalCents = numericToCents(alloc.total_price_usd);

    let nextStatus = alloc.status;
    if (alloc.status === 'RESERVED' && paidCents >= depositCents) {
      nextStatus = 'AWAITING_SIGNATURE';
    } else if (alloc.status === 'ACTIVE' && (settlement.hasPlan ? settlement.allPaid : paidCents >= totalCents)) {
      nextStatus = 'PAID_IN_FULL';
    }
    if (nextStatus !== alloc.status) {
      await client.query('UPDATE allocations SET status = $1, updated_at = now() WHERE allocation_id = $2', [nextStatus, allocationId]);
    }

    // What the buyer still owes: instalments (including any interest) once a plan exists, else price balance.
    const position = settlement.hasPlan ? await planPosition(client, allocationId) : null;
    const outstandingCents = position ? position.outstandingCents : Math.max(0, totalCents - paidCents);

    // 6. Receipt to the buyer (queued in this transaction; sent by the dispatcher after commit)
    await enqueueMessage(client, {
      subjectId: alloc.subject_id,
      template: 'PAYMENT_RECEIPT',
      dedupeKey: `receipt:${payment.payment_id}`,
      params: {
        receipt: payment.receipt_number,
        amount: currency === 'ZWG' ? `ZiG ${amountOriginal} (${usd(amountCents)})` : usd(amountCents),
        stand: alloc.stand_number,
        channel,
        date: todayHarare(new Date(receivedAt)),
        balance: usd(outstandingCents),
        ref: alloc.account_ref,
      },
    });

    await audit(client, recordedBy, 'PAYMENT_RECORDED', 'payments', payment.payment_id, {
      allocationId,
      amountUsd: amountFormatted,
      currency,
      amountOriginal,
      fxRate,
      channel,
      appliedToInstalmentsUsd: centsToNumeric(settlement.appliedCents),
      newStatus: nextStatus,
    });

    return {
      payment,
      receiptNumber: payment.receipt_number,
      newStatus: nextStatus,
      totalPaidUsd: paidCents / 100,
      remainingBalanceUsd: Number(bal.balance_usd),
      outstandingUsd: outstandingCents / 100,
      appliedToInstalmentsUsd: settlement.appliedCents / 100,
    };
  }

  async getAccountStatement(allocationId) {
    const allocRes = await this.db.query(
      `SELECT a.*, p.user_sub, p.first_name, p.last_name, p.national_id, p.phone_number, p.physical_address,
              s.stand_number, s.scheme_name, s.site_location, s.area_sqm,
              b.paid_usd, b.balance_usd
       FROM allocations a
       JOIN la_party p ON a.subject_id = p.subject_id
       JOIN la_spatial_unit s ON a.parcel_id = s.parcel_id
       JOIN allocation_balances b ON a.allocation_id = b.allocation_id
       WHERE a.allocation_id = $1`,
      [allocationId]
    );
    if (allocRes.rows.length === 0) throw notFound('Allocation');

    const paymentsRes = await this.db.query(
      `SELECT payment_id, channel, amount_usd, currency, amount_original, fx_rate,
              external_reference, receipt_number, received_at
       FROM payments
       WHERE allocation_id = $1
       ORDER BY received_at ASC`,
      [allocationId]
    );

    const position = await planPosition(this.db, allocationId);
    return {
      allocation: allocRes.rows[0],
      payments: paymentsRes.rows,
      paymentPlan: position && {
        ...position.plan,
        installments: position.installments,
        outstandingUsd: centsToNumeric(position.outstandingCents),
        overdueUsd: centsToNumeric(position.overdueCents),
        nextInstalment: position.next && { ...position.next, amountUsd: centsToNumeric(position.next.amountCents) },
      },
    };
  }
}
