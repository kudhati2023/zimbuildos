import { toInternationalDigits } from './phone.js';
import { maskPhone } from './securityLog.js';

/**
 * Buyer-facing SMS / WhatsApp templates. `vars` order is also the {{1}}, {{2}}… order of the matching
 * WhatsApp template, which must be created and approved in Meta WhatsApp Manager under `wa` before
 * WhatsApp delivery is switched on (business-initiated WhatsApp messages must use approved templates).
 */
export const TEMPLATES = Object.freeze({
  APPLICATION_RECEIVED: {
    wa: 'zhms_application_received',
    vars: ['name', 'category'],
    text: 'ZimBuild: {name}, we have received your stand application ({category} category). We will message you after each review step.',
  },
  RESERVATION_CONFIRMED: {
    wa: 'zhms_reservation_confirmed',
    vars: ['name', 'stand', 'deposit', 'expires', 'ref'],
    text: 'ZimBuild: {name}, stand {stand} is reserved for you. Pay the deposit of {deposit} by {expires} on EcoCash or bank transfer using reference {ref}.',
  },
  PAYMENT_RECEIPT: {
    wa: 'zhms_payment_receipt',
    vars: ['receipt', 'amount', 'stand', 'channel', 'date', 'balance', 'ref'],
    text: 'ZimBuild receipt {receipt}: {amount} received for stand {stand} via {channel} on {date}. Outstanding: {balance}. Ref {ref}.',
  },
  AGREEMENT_SIGNED: {
    wa: 'zhms_agreement_signed',
    vars: ['name', 'stand', 'monthly', 'term', 'first_due', 'ref'],
    text: 'ZimBuild: {name}, your Agreement of Sale for stand {stand} is signed. Instalments: {monthly} a month for {term} months, first due {first_due}. Pay with reference {ref}.',
  },
  PAYMENT_REMINDER: {
    wa: 'zhms_payment_reminder',
    vars: ['amount', 'stand', 'due', 'ref', 'balance'],
    text: 'ZimBuild reminder: your instalment of {amount} for stand {stand} is due on {due}. Pay with reference {ref}. Total outstanding: {balance}.',
  },
  PAYMENT_OVERDUE: {
    wa: 'zhms_payment_overdue',
    vars: ['amount', 'stand', 'due', 'ref'],
    text: 'ZimBuild: your instalment of {amount} for stand {stand}, due on {due}, is overdue. Please pay with reference {ref} or contact our finance office.',
  },
  MONTHLY_STATEMENT: {
    wa: 'zhms_monthly_statement',
    vars: ['month', 'stand', 'paid', 'balance', 'next_amount', 'next_due', 'ref'],
    text: 'ZimBuild statement {month}, stand {stand}: paid to date {paid}, outstanding {balance}. Next instalment {next_amount} due {next_due}. Ref {ref}.',
  },
  DEED_ISSUED: {
    wa: 'zhms_deed_issued',
    vars: ['name', 'stand', 'document'],
    text: 'ZimBuild: congratulations {name}! Deed of Transfer {document} for stand {stand} has been issued.',
  },
});

export function renderTemplate(name, params) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown message template ${name}`);
  for (const v of t.vars) {
    if (params[v] === undefined || params[v] === null) throw new Error(`Template ${name} is missing "${v}"`);
  }
  return t.text.replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
}

/** "US$1,234.50" from integer cents. */
export const usd = (cents) =>
  'US$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Queues a message inside the caller's transaction (outbox pattern): if the business change rolls
 * back, the message disappears with it; if it commits, the dispatcher will deliver it.
 * Returns the message id, or null if it was a duplicate or the party has no usable phone number.
 */
export async function enqueueMessage(client, { subjectId, template, params, dedupeKey = null }) {
  const body = renderTemplate(template, params);
  const { rows } = await client.query('SELECT phone_number, preferred_channel FROM la_party WHERE subject_id = $1', [subjectId]);
  if (!rows.length) throw new Error(`Party ${subjectId} not found for message ${template}`);
  const to = toInternationalDigits(rows[0].phone_number);
  if (!to) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'message skipped: unusable phone number', subjectId, template }));
    return null;
  }
  const res = await client.query(
    `INSERT INTO outbound_messages (subject_id, to_phone, channel, template, params, body, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING message_id`,
    [subjectId, to, rows[0].preferred_channel, template, JSON.stringify(params), body, dedupeKey]);
  return res.rows[0]?.message_id ?? null;
}

// ------------------------------------------------------------------ delivery

const CONSOLE_DEFAULTS = { whatsappProvider: 'console', smsProvider: 'console', maxAttempts: 5 };

async function postJson(url, headers, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

/** Sends one message through the configured provider; returns the provider's message reference. */
export function createTransport(messaging) {
  return async (m) => {
    const provider = m.channel === 'WHATSAPP' ? messaging.whatsappProvider : messaging.smsProvider;
    if (provider === 'console') {
      // Message bodies carry names, amounts and payment references: logged only when explicitly allowed (never in production).
      console.log(JSON.stringify({
        level: 'info', msg: 'message (console provider, not sent)', channel: m.channel, template: m.template,
        to: maskPhone(m.to_phone), ...(messaging.logBodies && { body: m.body }),
      }));
      return `console-${m.message_id}`;
    }
    if (provider === 'cloud') {
      const { token, phoneNumberId, apiVersion, language } = messaging.whatsapp;
      const t = TEMPLATES[m.template];
      const json = await postJson(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        { Authorization: `Bearer ${token}` },
        {
          messaging_product: 'whatsapp',
          to: m.to_phone,
          type: 'template',
          template: {
            name: t.wa,
            language: { code: language },
            components: [{ type: 'body', parameters: t.vars.map((v) => ({ type: 'text', text: String(m.params[v]) })) }],
          },
        });
      return json.messages?.[0]?.id ?? 'whatsapp';
    }
    if (provider === 'http') {
      const { url, token, senderId } = messaging.sms;
      const json = await postJson(url, token ? { Authorization: `Bearer ${token}` } : {},
        { to: `+${m.to_phone}`, from: senderId, message: m.body });
      return String(json.id ?? json.messageId ?? 'sms');
    }
    throw new Error(`Unknown provider ${provider}`);
  };
}

export class MessageDispatcher {
  constructor(db, config = {}, { transport } = {}) {
    this.db = db;
    this.messaging = { ...CONSOLE_DEFAULTS, ...(config.messaging ?? {}) };
    this.transport = transport ?? createTransport(this.messaging);
  }

  /** Sends due messages. Safe to run from several processes at once (rows are claimed with SKIP LOCKED). */
  async dispatch({ limit = 50 } = {}) {
    // Recover messages claimed by a process that died mid-send.
    await this.db.query(
      `UPDATE outbound_messages SET status = 'QUEUED', claimed_at = NULL
        WHERE status = 'SENDING' AND claimed_at < now() - interval '10 minutes'`);
    const { rows } = await this.db.query(
      `UPDATE outbound_messages SET status = 'SENDING', claimed_at = now(), attempts = attempts + 1
        WHERE message_id IN (
          SELECT message_id FROM outbound_messages
           WHERE status = 'QUEUED' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
        RETURNING *`, [limit]);

    const result = { sent: 0, retrying: 0, failed: 0 };
    for (const m of rows) {
      try {
        const ref = await this.transport(m);
        await this.db.query(
          `UPDATE outbound_messages SET status = 'SENT', provider_ref = $2, sent_at = now(), last_error = NULL
            WHERE message_id = $1`, [m.message_id, ref]);
        result.sent += 1;
      } catch (err) {
        const final = m.attempts >= this.messaging.maxAttempts;
        // Exponential back-off: 2, 4, 8, 16… minutes.
        await this.db.query(
          `UPDATE outbound_messages
              SET status = $2, last_error = $3, claimed_at = NULL,
                  next_attempt_at = now() + make_interval(mins => $4)
            WHERE message_id = $1`,
          [m.message_id, final ? 'FAILED' : 'QUEUED', String(err.message).slice(0, 500), 2 ** m.attempts]);
        if (final) result.failed += 1;
        else result.retrying += 1;
      }
    }
    return result;
  }
}
