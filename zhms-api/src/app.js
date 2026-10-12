import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { authenticate, requireRole, ROLES, isStaff, hasRole, verifyToken } from './auth.js';
import { securityEvent } from './securityLog.js';
import { notFound, badRequest, forbidden, AppError, mapDbError } from './errors.js';
import { audit } from './db.js';
import { toCents, centsToNumeric, numericToCents } from './money.js';
import { buildSchedule, flatMarkupRates } from './schedule.js';
import { todayHarare } from './dates.js';
import { checkWebhookSignature } from './signature.js';
import { planPosition } from './instalments.js';
import { enqueueMessage, usd } from './messaging.js';
import { constructionRouter } from './constructionRoutes.js';

const LIVE_ALLOCATION = ['RESERVED', 'AWAITING_SIGNATURE', 'ACTIVE', 'PAID_IN_FULL', 'COMPLETED'];
const SERVICING_STATES = ['PENDING', 'IN_PROGRESS', 'CERTIFIED'];
const pct = (rate) => Math.round(rate * 10000) / 100;

export function createApp(db, services, config) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a TLS-terminating proxy, req.ip must be the client (rate limits, security log), not the proxy.
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({
    // No wildcard: without an explicit allow-list browsers get no CORS headers (same-origin only).
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key']
  }));
  // Keep the exact request bytes: payment webhooks are signed over the raw body.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  // Global rate limiter
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  // Stricter limits for unauthenticated endpoints that create accounts or reveal signed documents.
  const strictLimiter = (max) => rateLimit({
    windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => {
      securityEvent('RATE_LIMITED', { req });
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests, please try again later' });
    },
  });
  const registrationLimiter = strictLimiter(10);
  const verificationLimiter = strictLimiter(60);

  // 1. Public Health & Verifications
  app.get('/healthz', (_req, res) => res.json({ status: 'UP', service: 'zhms-api' }));
  // Public QR/link check of a signed document. Returns proof of authenticity only, never the buyer's PII.
  app.get('/api/v1/verify/:token', verificationLimiter, async (req, res, next) => {
    try {
      if (!/^[a-f0-9]{48}$/.test(req.params.token)) throw notFound('Document verification record');
      const doc = await services.issuance.verifyDocument(req.params.token);
      res.json({ verified: true, document: doc });
    } catch (e) { next(e); }
  });

  // 2. Spatial Cadastre Inventory
  app.get('/api/v1/spatial/stands', async (req, res, next) => {
    try {
      const { scheme, status } = req.query;
      let sql = 'SELECT * FROM la_spatial_unit WHERE 1=1';
      const params = [];
      if (scheme) { params.push(scheme); sql += ` AND scheme_name = $${params.length}`; }
      if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
      sql += ' ORDER BY stand_number ASC';

      const { rows } = await db.query(sql, params);
      res.json({ count: rows.length, stands: rows });
    } catch (e) { next(e); }
  });

  // 3. Applications
  app.post('/api/v1/applications', authenticate(config), async (req, res, next) => {
    try {
      const app = await services.application.submitApplication(req.user.sub, req.body, { staff: isStaff(req.user) });
      res.status(201).json({ status: 'SUBMITTED', application: app });
    } catch (e) { next(e); }
  });

  // 3b. Public Online & Mobile Registration for Youth Applicants
  app.post('/api/v1/public/youth-registration', registrationLimiter, async (req, res, next) => {
    try {
      const { userSub: _ignored, ...body } = req.body ?? {};
      const data = {
        ...body,
        quotaCategory: 'YOUTH',
        registrationChannel: body.registrationChannel || 'MOBILE',
        preferredChannel: body.preferredChannel || 'WHATSAPP',
      };
      // The subject is ALWAYS generated server-side: a caller-chosen sub would let anyone mint a token for another account.
      const actorSub = `youth_${randomUUID()}`;
      const appRecord = await services.application.submitApplication(actorSub, data, { staff: false });
      
      const applicantToken = jwt.sign(
        { sub: actorSub, roles: [ROLES.APPLICANT] },
        config.jwtSecret,
        { issuer: config.jwtIssuer, audience: config.jwtAudience, expiresIn: '7d' }
      );
      
      securityEvent('APPLICANT_TOKEN_ISSUED', { req, outcome: 'SUCCESS', subject: actorSub });
      res.status(201).json({
        status: 'SUBMITTED',
        application: appRecord,
        token: applicantToken,
        userSub: actorSub,
        message: 'Youth applicant registered successfully. WhatsApp/SMS confirmation queued.'
      });
    } catch (e) { next(e); }
  });

  app.get('/api/v1/applications', authenticate(config), requireRole(ROLES.LAND_OFFICER, ROLES.FINANCE_MANAGER, ROLES.CEO, ROLES.ADMIN), async (req, res, next) => {
    try {
      const { status } = req.query;
      let sql = `SELECT a.*, p.first_name, p.last_name, p.national_id, p.phone_number
                 FROM applications a
                 JOIN la_party p ON a.subject_id = p.subject_id`;
      const params = [];
      if (status) {
        params.push(status);
        sql += ` WHERE a.status = $1`;
      }
      sql += ' ORDER BY a.first_submitted_at ASC';
      const { rows } = await db.query(sql, params);
      res.json({ count: rows.length, applications: rows });
    } catch (e) { next(e); }
  });

  app.post('/api/v1/applications/:id/review', authenticate(config), async (req, res, next) => {
    try {
      const { role, decision, reason } = req.body;
      if (!req.user.roles.includes(role)) {
        securityEvent('AUTHZ_ROLE_DENIED', { req, required: [role], held: req.user.roles });
        return res.status(403).json({ error: 'FORBIDDEN_ROLE', message: `User does not possess reviewer role ${role}` });
      }
      const updated = await services.application.reviewApplication(req.params.id, role, req.user.sub, decision, reason);
      res.json({ status: 'REVIEW_RECORDED', application: updated });
    } catch (e) { next(e); }
  });

  app.post('/api/v1/applications/:id/resubmit', authenticate(config), async (req, res, next) => {
    try {
      const resubmitted = await services.application.resubmitApplication(req.params.id, req.user.sub, req.body, { staff: isStaff(req.user) });
      res.json({ status: 'RESUBMITTED', application: resubmitted });
    } catch (e) { next(e); }
  });

  // 4. Stand Allocations
  app.post('/api/v1/allocations/reserve', authenticate(config), requireRole(ROLES.LAND_OFFICER, ROLES.ADMIN), async (req, res, next) => {
    try {
      const { applicationId, parcelId, queueOverrideReason } = req.body;
      const key = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
      const alloc = await services.allocation.reserveStand({
        applicationId,
        parcelId,
        idempotencyKey: key,
        reservedBy: req.user.sub,
        queueOverrideReason
      });
      res.status(201).json({ status: 'RESERVED', allocation: alloc });
    } catch (e) { next(e); }
  });

  // 5. Payments & Statements
  app.post('/api/v1/payments', authenticate(config), requireRole(ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK, ROLES.ADMIN), async (req, res, next) => {
    try {
      const result = await services.payment.recordPayment({
        ...req.body,
        recordedBy: req.user.sub
      });
      res.status(201).json({ status: 'RECORDED', ...result });
    } catch (e) { next(e); }
  });

  app.get('/api/v1/allocations/:id/statement', authenticate(config), async (req, res, next) => {
    try {
      const statement = await services.payment.getAccountStatement(req.params.id);
      // Access check: Only staff or the allocated subject's owner
      if (!isStaff(req.user) && statement.allocation.user_sub !== req.user.sub) {
        securityEvent('AUTHZ_NOT_OWNER', { req, resource: 'statement' });
        return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only view your own account statement' });
      }
      res.json(statement);
    } catch (e) { next(e); }
  });

  // 6. CEO Document Signing
  app.post('/api/v1/allocations/:id/sign-agreement', authenticate(config), requireRole(ROLES.CEO), async (req, res, next) => {
    try {
      const doc = await services.issuance.signAgreementOfSale({
        allocationId: req.params.id,
        ceoSub: req.user.sub,
        planTerms: req.body?.planTerms ?? {}
      });
      res.json(doc);
    } catch (e) { next(e); }
  });

  app.post('/api/v1/allocations/:id/sign-deed', authenticate(config), requireRole(ROLES.CEO), async (req, res, next) => {
    try {
      const doc = await services.issuance.signDeedOfTransfer({
        allocationId: req.params.id,
        ceoSub: req.user.sub
      });
      res.json(doc);
    } catch (e) { next(e); }
  });

  // 7. Owner Self-Service Portal
  app.get('/api/v1/owner/my-allocations', authenticate(config), async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT a.*, s.stand_number, s.scheme_name, s.site_location, s.area_sqm,
                b.paid_usd, b.balance_usd,
                p.first_name, p.last_name, p.national_id, p.phone_number
         FROM allocations a
         JOIN la_party p ON a.subject_id = p.subject_id
         JOIN la_spatial_unit s ON a.parcel_id = s.parcel_id
         JOIN allocation_balances b ON a.allocation_id = b.allocation_id
         WHERE p.user_sub = $1
         ORDER BY a.created_at DESC`,
        [req.user.sub]
      );
      res.json({ allocations: rows });
    } catch (e) { next(e); }
  });

  // 7b. GIS cadastre for the web map
  /** Signed-in staff see holder names on the map; everyone else gets the same map without personal data. */
  const optionalStaff = (req) => {
    const [scheme, tok] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !tok) return false;
    try { return isStaff(verifyToken(tok, config)); } catch { return false; }
  };

  app.get('/api/v1/gis/developments', async (_req, res, next) => {
    try {
      res.json({ developments: await services.gis.listDevelopments() });
    } catch (e) { next(e); }
  });

  app.post('/api/v1/gis/developments', authenticate(config), requireRole(ROLES.LAND_OFFICER, ROLES.ADMIN), async (req, res, next) => {
    try {
      res.status(201).json({ development: await services.gis.createDevelopment(req.body, req.user.sub) });
    } catch (e) { next(e); }
  });

  app.get('/api/v1/gis/developments/:id/stands', async (req, res, next) => {
    try {
      res.json(await services.gis.standsFeatureCollection(req.params.id, { includeHolders: optionalStaff(req) }));
    } catch (e) { next(e); }
  });

  app.post('/api/v1/gis/developments/:id/stands/import', authenticate(config), requireRole(ROLES.LAND_OFFICER), async (req, res, next) => {
    try {
      res.status(201).json(await services.gis.importStands(req.params.id, req.body, req.user.sub));
    } catch (e) { next(e); }
  });

  app.get('/api/v1/gis/zoning-summary', async (_req, res, next) => {
    try {
      res.json({ developments: await services.gis.zoningSummary() });
    } catch (e) { next(e); }
  });

  app.get('/api/v1/reports/statutory-summary', authenticate(config),
    requireRole(ROLES.CEO, ROLES.FINANCE_MANAGER, ROLES.LAND_OFFICER, ROLES.AUDITOR, ROLES.ADMIN), async (_req, res, next) => {
      try {
        res.json(await services.gis.statutorySummary());
      } catch (e) { next(e); }
    });

  // 8. Instalment quotes: show buyers the true cost of a plan before they commit (public)
  app.post('/api/v1/payment-plans/quote', (req, res, next) => {
    try {
      const b = req.body ?? {};
      const priceCents = toCents(b.priceUsd);
      const depositCents = b.depositUsd === undefined || Number(b.depositUsd) === 0 ? 0 : toCents(b.depositUsd);
      if (depositCents >= priceCents) throw badRequest('INVALID_DEPOSIT', 'Deposit must be less than the price');
      let schedule;
      try {
        schedule = buildSchedule({
          financedCents: priceCents - depositCents,
          termMonths: b.termMonths,
          monthlyRateBps: b.monthlyRateBps ?? 0,
          interestFreeMonths: b.interestFreeMonths ?? 0,
          startDate: todayHarare(),
        });
      } catch (e) {
        if (e instanceof RangeError) throw badRequest('INVALID_PLAN_TERMS', e.message);
        throw e;
      }
      const body = {
        financedUsd: centsToNumeric(priceCents - depositCents),
        monthlyPaymentUsd: centsToNumeric(schedule.monthlyPaymentCents),
        totalInterestUsd: centsToNumeric(schedule.totalInterestCents),
        totalRepayableUsd: centsToNumeric(schedule.totalRepayableCents),
        effectiveAnnualRatePercent: pct(schedule.effectiveAnnualRate),
        nominalAnnualRatePercent: pct(schedule.nominalAnnualRate),
        instalments: schedule.installments.map((i) => ({
          seq: i.seq, dueDate: i.dueDate, amountUsd: centsToNumeric(i.principalCents + i.interestCents),
        })),
      };
      if (b.compareFlatMarkupPercent !== undefined) {
        const m = Number(b.compareFlatMarkupPercent);
        if (!Number.isFinite(m) || m < 0 || m > 500) throw badRequest('INVALID_MARKUP', 'compareFlatMarkupPercent must be 0-500');
        const flat = flatMarkupRates(priceCents - depositCents, m, b.termMonths);
        body.flatMarkupComparison = {
          markupPercent: m,
          effectiveAnnualRatePercent: pct(flat.effective),
          nominalAnnualRatePercent: pct(flat.nominal),
        };
      }
      res.json(body);
    } catch (e) { next(e); }
  });

  // 9. Transparent allocation register (public, no personal data)
  app.get('/api/v1/public/allocation-register', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT s.stand_number, s.scheme_name, s.site_location, s.area_sqm, s.price_usd, s.status,
                s.quota_category, s.water_status, s.sewer_status, s.roads_status,
                a.status AS allocation_status, a.reserved_at::date::text AS allocated_on
           FROM la_spatial_unit s
           LEFT JOIN allocations a ON a.parcel_id = s.parcel_id AND a.status = ANY($2::text[])
          WHERE ($1::text IS NULL OR s.scheme_name = $1)
          ORDER BY s.scheme_name, s.stand_number`,
        [req.query.scheme ?? null, LIVE_ALLOCATION]);
      res.json({ count: rows.length, stands: rows });
    } catch (e) { next(e); }
  });

  app.get('/api/v1/public/quota-summary', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT scheme_name, quota_category,
                count(*)::int AS stands,
                count(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
                count(*) FILTER (WHERE status IN ('RESERVED','ALLOCATED'))::int AS taken,
                round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY scheme_name), 1)::float AS share_percent
           FROM la_spatial_unit
          WHERE ($1::text IS NULL OR scheme_name = $1)
          GROUP BY scheme_name, quota_category
          ORDER BY scheme_name, quota_category`, [req.query.scheme ?? null]);
      res.json({ quotas: rows });
    } catch (e) { next(e); }
  });

  // 10. Payment gateway webhooks (EcoCash, bank, O'mari, Innbucks). Authenticated by HMAC signature, not JWT.
  // 10a. Provider-specific inbound adapter endpoint (normalises provider format into canonical ZHMS payload)
  app.post('/api/v1/webhooks/adapters/:provider', async (req, res, next) => {
    try {
      const provider = String(req.params.provider).toLowerCase();
      let canonical;
      let channel;

      if (provider === 'ecocash') {
        const { PaymentGatewayAdapter } = await import('./gatewayAdapters.js');
        canonical = PaymentGatewayAdapter.normaliseEcoCash(req.body);
        channel = 'ECOCASH';
      } else if (provider === 'onemoney' || provider === 'omari') {
        const { PaymentGatewayAdapter } = await import('./gatewayAdapters.js');
        canonical = PaymentGatewayAdapter.normaliseOneMoney(req.body);
        channel = 'OMARI';
      } else if (provider === 'innbucks') {
        const { PaymentGatewayAdapter } = await import('./gatewayAdapters.js');
        canonical = PaymentGatewayAdapter.normaliseInnbucks(req.body);
        channel = 'BANK_TRANSFER';
      } else {
        return res.status(404).json({ error: 'UNKNOWN_PROVIDER', message: `No adapter for provider ${provider}` });
      }

      // Check signature on the inbound request using the channel's secret
      const problem = checkWebhookSignature({
        rawBody: req.rawBody,
        timestamp: req.get('x-zhms-timestamp'),
        signature: req.get('x-zhms-signature'),
        secret: config.webhookSecrets?.[channel],
      });
      if (problem) securityEvent('WEBHOOK_SIGNATURE_REJECTED', { req, channel: channel.slice(0, 20), reason: problem });
      if (problem === 'CHANNEL_NOT_CONFIGURED') return res.status(404).json({ error: problem, message: 'No webhook configured for this channel' });
      if (problem) return res.status(401).json({ error: problem, message: 'Webhook signature rejected' });

      res.json(await services.inbox.receiveWebhook(channel, canonical));
    } catch (e) { next(e); }
  });

  app.post('/api/v1/webhooks/payments/:channel', async (req, res, next) => {
    try {
      const channel = String(req.params.channel).toUpperCase();
      const problem = checkWebhookSignature({
        rawBody: req.rawBody,
        timestamp: req.get('x-zhms-timestamp'),
        signature: req.get('x-zhms-signature'),
        secret: config.webhookSecrets?.[channel],
      });
      if (problem) securityEvent('WEBHOOK_SIGNATURE_REJECTED', { req, channel: channel.slice(0, 20), reason: problem });
      if (problem === 'CHANNEL_NOT_CONFIGURED') return res.status(404).json({ error: problem, message: 'No webhook configured for this channel' });
      if (problem) return res.status(401).json({ error: problem, message: 'Webhook signature rejected' });
      // 200 for every accepted outcome (APPLIED / DUPLICATE / PENDING_REVIEW / IGNORED) so the gateway stops retrying.
      res.json(await services.inbox.receiveWebhook(channel, req.body));
    } catch (e) { next(e); }
  });

  // 11. Payment inbox: buyer proof of payment and finance review
  app.post('/api/v1/owner/proof-of-payment', authenticate(config), async (req, res, next) => {
    try {
      res.status(201).json(await services.inbox.submitProofOfPayment(req.user.sub, req.body ?? {}));
    } catch (e) { next(e); }
  });

  app.get('/api/v1/payments/inbox', authenticate(config), requireRole(ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK), async (req, res, next) => {
    try {
      const status = req.query.status ?? 'PENDING_REVIEW';
      if (!['PENDING_REVIEW', 'APPLIED', 'REJECTED'].includes(status)) throw badRequest('INVALID_STATUS', 'Unknown inbox status');
      const items = await services.inbox.list(status);
      res.json({ count: items.length, items });
    } catch (e) { next(e); }
  });

  app.post('/api/v1/payments/inbox/:id/approve', authenticate(config), requireRole(ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK), async (req, res, next) => {
    try {
      res.json(await services.inbox.approve(req.params.id, { allocationId: req.body?.allocationId ?? null }, req.user.sub));
    } catch (e) { next(e); }
  });

  app.post('/api/v1/payments/inbox/:id/reject', authenticate(config), requireRole(ROLES.FINANCE_MANAGER), async (req, res, next) => {
    try {
      res.json(await services.inbox.reject(req.params.id, req.body?.reason, req.user.sub));
    } catch (e) { next(e); }
  });

  // 12. ZiG exchange rates
  app.post('/api/v1/fx-rates', authenticate(config), requireRole(ROLES.FINANCE_MANAGER), async (req, res, next) => {
    try {
      res.status(201).json(await services.inbox.recordFxRate(req.body ?? {}, req.user.sub));
    } catch (e) { next(e); }
  });

  app.get('/api/v1/fx-rates/latest', authenticate(config), async (_req, res, next) => {
    try {
      res.json(await services.inbox.latestFxRate());
    } catch (e) { next(e); }
  });

  // 13. Statements on demand
  app.post('/api/v1/allocations/:id/statement/send', authenticate(config), requireRole(ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK), async (req, res, next) => {
    try {
      const messageId = await services.jobs.sendStatementNow(req.params.id, req.user.sub);
      res.status(202).json({ status: messageId ? 'QUEUED' : 'NO_USABLE_PHONE', messageId });
    } catch (e) { next(e); }
  });

  // 13b. Automated SMS/WhatsApp Payment Reminder on demand
  app.post('/api/v1/allocations/:id/reminder/send', authenticate(config), requireRole(ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK, ROLES.ADMIN), async (req, res, next) => {
    try {
      const { rows: [plan] } = await db.query(
        `SELECT p.plan_id, a.allocation_id, a.subject_id, a.account_ref, s.stand_number
           FROM payment_plans p
           JOIN allocations a ON a.allocation_id = p.allocation_id
           JOIN la_spatial_unit s ON s.parcel_id = a.parcel_id
          WHERE a.allocation_id = $1`, [req.params.id]);
      if (!plan) throw notFound('Payment plan');
      const { rows: [nextInst] } = await db.query(
        `SELECT * FROM plan_installments
          WHERE plan_id = $1 AND status IN ('DUE', 'PARTIAL', 'OVERDUE')
          ORDER BY seq ASC LIMIT 1`, [plan.plan_id]);
      if (!nextInst) return res.status(200).json({ status: 'NO_PENDING_INSTALMENTS', message: 'All instalments paid' });
      
      const position = await planPosition(db.pool, plan.allocation_id);
      const owedCents = numericToCents(nextInst.principal_usd) + numericToCents(nextInst.interest_usd) - numericToCents(nextInst.paid_usd);
      const msgId = await db.tx(async (client) => {
        return enqueueMessage(client, {
          subjectId: plan.subject_id,
          template: nextInst.status === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_REMINDER',
          dedupeKey: `manual-reminder:${nextInst.installment_id}:${Date.now()}`,
          params: {
            amount: usd(owedCents),
            stand: plan.stand_number,
            due: nextInst.due_date?.toISOString?.()?.slice(0, 10) || String(nextInst.due_date),
            ref: plan.account_ref,
            balance: usd(position.outstandingCents),
          }
        });
      });
      res.status(202).json({ status: msgId ? 'QUEUED' : 'NO_USABLE_PHONE', messageId: msgId });
    } catch (e) { next(e); }
  });

  // 13c. EcoCash push SIMULATOR. It credits a payment without any gateway signature, so it exists only when
  // ENABLE_PAYMENT_SIMULATOR=true outside production (config refuses it in production), and even then only
  // finance staff or the allocation's own buyer may use it. Real payments arrive via the signed webhook (10).
  app.post('/api/v1/payments/ecocash-push', authenticate(config), async (req, res, next) => {
    try {
      if (!config.paymentSimulator) {
        securityEvent('PAYMENT_SIMULATOR_BLOCKED', { req });
        throw new AppError(404, 'PAYMENT_SIMULATOR_DISABLED', 'The EcoCash push simulator is disabled on this server');
      }
      const { accountRef, amount, payerPhone, currency = 'USD' } = req.body ?? {};
      if (!accountRef || !amount) throw badRequest('MISSING_FIELDS', 'accountRef and amount are required');
      const normalisedRef = String(accountRef).trim().toUpperCase();
      if (!hasRole(req.user, ROLES.FINANCE_MANAGER, ROLES.FINANCE_CLERK, ROLES.ADMIN)) {
        const { rows } = await db.query(
          `SELECT 1 FROM allocations a JOIN la_party p ON p.subject_id = a.subject_id
            WHERE a.account_ref = $1 AND p.user_sub = $2`, [normalisedRef, req.user.sub]);
        if (!rows.length) {
          securityEvent('AUTHZ_NOT_OWNER', { req, resource: 'ecocash-push' });
          throw forbidden('NOT_ALLOCATION_OWNER', 'You can only pay into your own stand account');
        }
      }
      const ref = `SIM-${randomUUID()}`;
      const result = await services.inbox.receiveWebhook('ECOCASH', {
        status: 'SUCCESS',
        reference: ref,
        accountRef: normalisedRef,
        amount: String(amount),
        currency,
        payerPhone: typeof payerPhone === 'string' ? payerPhone : null,
        paidAt: new Date().toISOString()
      });
      securityEvent('PAYMENT_SIMULATED', { req, outcome: 'SUCCESS', reference: ref });
      res.json({
        status: 'ECOCASH_PUSH_COMPLETED',
        reference: ref,
        result
      });
    } catch (e) { next(e); }
  });

  // 14. Infrastructure servicing certification (civil engineering unit) — required before any title deed
  app.put('/api/v1/stands/:id/servicing', authenticate(config), requireRole(ROLES.ENGINEER), async (req, res, next) => {
    try {
      const b = req.body ?? {};
      const updates = { water_status: b.water, sewer_status: b.sewer, roads_status: b.roads };
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined && !SERVICING_STATES.includes(v)) throw badRequest('INVALID_SERVICING_STATE', `${k} must be one of ${SERVICING_STATES.join(', ')}`);
      }
      const stand = await db.tx(async (client) => {
        const { rows: [cur] } = await client.query('SELECT * FROM la_spatial_unit WHERE parcel_id = $1 FOR UPDATE', [req.params.id]);
        if (!cur) throw notFound('Stand');
        const next = Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, v ?? cur[k]]));
        const allCertified = Object.values(next).every((v) => v === 'CERTIFIED');
        const certificateRef = typeof b.certificateRef === 'string' ? b.certificateRef.trim() : '';
        if (allCertified && !certificateRef && !cur.servicing_certificate_ref) {
          throw badRequest('CERTIFICATE_REQUIRED', 'Full certification needs the council inspection certificate reference');
        }
        const { rows: [updated] } = await client.query(
          `UPDATE la_spatial_unit
              SET water_status = $2, sewer_status = $3, roads_status = $4,
                  servicing_certificate_ref = CASE WHEN $5 THEN COALESCE(NULLIF($6, ''), servicing_certificate_ref) END,
                  servicing_certified_by = CASE WHEN $5 THEN $7 END,
                  servicing_certified_at = CASE WHEN $5 THEN now() END
            WHERE parcel_id = $1 RETURNING *`,
          [req.params.id, next.water_status, next.sewer_status, next.roads_status, allCertified, certificateRef, req.user.sub]);
        await audit(client, req.user.sub, 'SERVICING_UPDATED', 'la_spatial_unit', req.params.id, {
          ...next, certificateRef: updated.servicing_certificate_ref,
        });
        return updated;
      });
      res.json({ stand });
    } catch (e) { next(e); }
  });

  // 15. Operations
  app.get('/api/v1/messages', authenticate(config), requireRole(ROLES.ADMIN, ROLES.FINANCE_MANAGER), async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT message_id, subject_id, to_phone, channel, template, body, status, attempts, last_error, created_at, sent_at
           FROM outbound_messages WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at DESC LIMIT 200`, [req.query.status ?? null]);
      res.json({ count: rows.length, messages: rows });
    } catch (e) { next(e); }
  });

  app.post('/api/v1/admin/jobs/run', authenticate(config), requireRole(ROLES.ADMIN), async (_req, res, next) => {
    try {
      res.json(await services.jobs.runAll());
    } catch (e) { next(e); }
  });

  app.get('/api/v1/audit/verify', authenticate(config), requireRole(ROLES.AUDITOR, ROLES.ADMIN), async (_req, res, next) => {
    try {
      const { rows: [r] } = await db.query('SELECT verify_audit_chain() AS first_bad_block, (SELECT count(*)::int FROM audit_log) AS blocks');
      res.json({ intact: r.first_bad_block === null, blocks: r.blocks, firstCorruptedBlock: r.first_bad_block });
    } catch (e) { next(e); }
  });

  // 16. Construction operations: job costing, site progress, tenders & subcontracts, quality, plant
  app.use('/api/v1/construction', constructionRouter(services, config));

  // Unknown routes: JSON 404 rather than Express's HTML page (no framework fingerprinting).
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found')));

  // Central Error Handler
  app.use((rawErr, req, res, _next) => {
    const err = mapDbError(rawErr);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'INVALID_JSON', message: 'Request body is not valid JSON' });
    if (!(err instanceof AppError) || err.status >= 500) {
      // Unexpected: log everything server-side, never leak SQL or stack details to the client.
      console.error(JSON.stringify({ level: 'error', msg: 'unhandled error', method: req.method, path: req.path, err: rawErr?.message, code: rawErr?.code }));
      return res.status(err.status >= 500 ? err.status : 500).json({
        error: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
        message: err instanceof AppError ? err.message : 'An unexpected error occurred',
      });
    }
    const body = { error: err.code, message: err.message };
    if (err.details) body.details = err.details;
    res.status(err.status).json(body);
  });

  return app;
}
