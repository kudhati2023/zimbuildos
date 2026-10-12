import crypto from 'node:crypto';
import { notFound, conflict } from './errors.js';
import { audit } from './db.js';
import { numericToCents, centsToNumeric } from './money.js';
import { resolvePlanTerms, createPlan } from './instalments.js';
import { enqueueMessage, usd } from './messaging.js';
import { todayHarare } from './dates.js';

export class IssuanceService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Signs the Agreement of Sale. If a balance remains, the instalment plan is created in the same
   * transaction (terms default from app_config; `planTerms` may override them) and written into
   * the signed content, so the buyer's agreement states exactly what they will pay and when.
   */
  async signAgreementOfSale({ allocationId, ceoSub, planTerms = {} }) {
    return this.db.tx(async (client) => {
      const allocRes = await client.query(
        `SELECT a.*, p.first_name, p.last_name, p.national_id, p.phone_number, p.physical_address,
                s.stand_number, s.scheme_name, s.site_location, s.area_sqm,
                b.paid_usd, b.balance_usd
         FROM allocations a
         JOIN la_party p ON a.subject_id = p.subject_id
         JOIN la_spatial_unit s ON a.parcel_id = s.parcel_id
         JOIN allocation_balances b ON a.allocation_id = b.allocation_id
         WHERE a.allocation_id = $1
         FOR UPDATE OF a`,
        [allocationId]
      );
      if (allocRes.rows.length === 0) throw notFound('Allocation');
      const alloc = allocRes.rows[0];

      if (alloc.status !== 'AWAITING_SIGNATURE') {
        throw conflict('NOT_AWAITING_SIGNATURE', `Agreement can only be signed when 50% deposit is paid (status: ${alloc.status})`);
      }

      // Instalment plan for whatever is still owed after the deposit
      const financedCents = numericToCents(alloc.total_price_usd) - numericToCents(alloc.paid_usd);
      const startDate = todayHarare();
      let planned = null;
      if (financedCents > 0) {
        const terms = await resolvePlanTerms(client, planTerms);
        planned = await createPlan(client, { allocationId, financedCents, terms, startDate, createdBy: ceoSub });
      }

      // Generate Agreement of Sale document number
      const seqRes = await client.query("SELECT 'ZIM-AOS-' || lpad(nextval('agreement_seq')::text, 6, '0') AS doc_num");
      const docNum = seqRes.rows[0].doc_num;

      const content = {
        documentType: 'MEMORANDUM_OF_AGREEMENT_OF_SALE',
        documentNumber: docNum,
        allocationId,
        buyer: {
          name: `${alloc.first_name} ${alloc.last_name}`,
          nationalId: alloc.national_id,
          phone: alloc.phone_number,
          address: alloc.physical_address
        },
        property: {
          standNumber: alloc.stand_number,
          schemeName: alloc.scheme_name,
          siteLocation: alloc.site_location,
          areaSqm: alloc.area_sqm
        },
        financials: {
          totalPriceUsd: alloc.total_price_usd,
          depositPaidUsd: alloc.paid_usd,
          balanceUsd: alloc.balance_usd
        },
        paymentPlan: planned && {
          accountReference: alloc.account_ref,
          financedUsd: centsToNumeric(financedCents),
          termMonths: planned.plan.term_months,
          monthlyRatePercent: planned.plan.monthly_rate_bps / 100,
          interestFreeMonths: planned.plan.interest_free_months,
          effectiveAnnualRatePercent: Math.round(planned.schedule.effectiveAnnualRate * 10000) / 100,
          totalRepayableUsd: centsToNumeric(planned.schedule.totalRepayableCents),
          graceDays: planned.plan.grace_days,
          instalments: planned.schedule.installments.map((i) => ({
            seq: i.seq,
            dueDate: i.dueDate,
            amountUsd: centsToNumeric(i.principalCents + i.interestCents),
          })),
        },
        terms: 'Official ZimBuild Property Sale Contract under LADM ISO 19152 tenure',
        signatory: {
          role: 'CEO',
          sub: ceoSub,
          signedAt: new Date().toISOString()
        }
      };

      const canonicalContent = JSON.stringify(content);
      const contentHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
      const token = crypto.randomBytes(24).toString('hex');

      await client.query(
        `INSERT INTO issued_documents (allocation_id, doc_type, document_number, signed_by, content, content_hash, verification_token)
         VALUES ($1, 'AGREEMENT_OF_SALE', $2, $3, $4, $5, $6)`,
        [allocationId, docNum, ceoSub, content, contentHash, token]
      );

      // ACTIVE while instalments remain; a buyer who already paid everything goes straight to PAID_IN_FULL.
      const newStatus = planned ? 'ACTIVE' : 'PAID_IN_FULL';
      await client.query('UPDATE allocations SET status = $1, updated_at = now() WHERE allocation_id = $2', [newStatus, allocationId]);

      if (planned) {
        const first = planned.schedule.installments[0];
        await enqueueMessage(client, {
          subjectId: alloc.subject_id,
          template: 'AGREEMENT_SIGNED',
          dedupeKey: `agreement:${allocationId}`,
          params: {
            name: alloc.first_name,
            stand: alloc.stand_number,
            monthly: usd(planned.schedule.monthlyPaymentCents),
            term: planned.plan.term_months,
            first_due: first.dueDate,
            ref: alloc.account_ref,
          },
        });
      }

      await audit(client, ceoSub, 'AGREEMENT_OF_SALE_SIGNED', 'issued_documents', docNum, {
        allocationId, planId: planned?.plan.plan_id ?? null,  // never the verification token: it unlocks the document
      });

      return {
        documentNumber: docNum,
        docType: 'AGREEMENT_OF_SALE',
        verificationToken: token,
        contentHash,
        status: newStatus,
        paymentPlan: content.paymentPlan,
      };
    });
  }

  async signDeedOfTransfer({ allocationId, ceoSub }) {
    return this.db.tx(async (client) => {
      const allocRes = await client.query(
        `SELECT a.*, p.first_name, p.last_name, p.national_id, p.phone_number, p.physical_address,
                s.stand_number, s.scheme_name, s.site_location, s.area_sqm, s.surveyor_general_ref,
                b.paid_usd, b.balance_usd
         FROM allocations a
         JOIN la_party p ON a.subject_id = p.subject_id
         JOIN la_spatial_unit s ON a.parcel_id = s.parcel_id
         JOIN allocation_balances b ON a.allocation_id = b.allocation_id
         WHERE a.allocation_id = $1
         FOR UPDATE OF a`,
        [allocationId]
      );
      if (allocRes.rows.length === 0) throw notFound('Allocation');
      const alloc = allocRes.rows[0];

      // PAID_IN_FULL is only reached after the Agreement of Sale is signed and every instalment is settled.
      // The database (trg_title_gate) independently re-checks this and 100% certified servicing.
      if (alloc.status !== 'PAID_IN_FULL') {
        throw conflict('NOT_PAID_IN_FULL', `Title Deed can only be issued after 100% full payment (status: ${alloc.status}, balance: $${alloc.balance_usd})`);
      }
      const { rows: [svc] } = await client.query(
        'SELECT water_status, sewer_status, roads_status FROM la_spatial_unit WHERE parcel_id = $1', [alloc.parcel_id]);
      const notCertified = Object.entries(svc).filter(([, v]) => v !== 'CERTIFIED').map(([k]) => k.replace('_status', ''));
      if (notCertified.length) {
        throw conflict('SERVICING_NOT_CERTIFIED', `Title Deed requires 100% certified servicing; not yet certified: ${notCertified.join(', ')}`);
      }

      const seqRes = await client.query("SELECT 'ZIM-DEED-' || lpad(nextval('deed_seq')::text, 6, '0') AS doc_num");
      const docNum = seqRes.rows[0].doc_num;

      const content = {
        documentType: 'DEED_OF_TRANSFER',
        documentNumber: docNum,
        allocationId,
        owner: {
          name: `${alloc.first_name} ${alloc.last_name}`,
          nationalId: alloc.national_id,
          phone: alloc.phone_number
        },
        property: {
          standNumber: alloc.stand_number,
          schemeName: alloc.scheme_name,
          siteLocation: alloc.site_location,
          areaSqm: alloc.area_sqm,
          surveyorRef: alloc.surveyor_general_ref
        },
        financials: {
          totalPriceUsd: alloc.total_price_usd,
          finalSettlementPaidUsd: alloc.paid_usd,
          status: 'FULLY_SETTLED'
        },
        signatory: {
          role: 'CEO',
          sub: ceoSub,
          signedAt: new Date().toISOString()
        }
      };

      const canonicalContent = JSON.stringify(content);
      const contentHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
      const token = crypto.randomBytes(24).toString('hex');

      await client.query(
        `INSERT INTO issued_documents (allocation_id, doc_type, document_number, signed_by, content, content_hash, verification_token)
         VALUES ($1, 'DEED', $2, $3, $4, $5, $6)`,
        [allocationId, docNum, ceoSub, content, contentHash, token]
      );

      // Transition allocation status to COMPLETED (releases person quota constraint)
      await client.query("UPDATE allocations SET status = 'COMPLETED', updated_at = now() WHERE allocation_id = $1", [allocationId]);

      await enqueueMessage(client, {
        subjectId: alloc.subject_id,
        template: 'DEED_ISSUED',
        dedupeKey: `deed:${allocationId}`,
        params: { name: alloc.first_name, stand: alloc.stand_number, document: docNum },
      });

      await audit(client, ceoSub, 'DEED_ISSUED', 'issued_documents', docNum, { allocationId });

      return {
        documentNumber: docNum,
        docType: 'DEED',
        verificationToken: token,
        contentHash,
        status: 'COMPLETED'
      };
    });
  }

  /**
   * Public authenticity check (QR code / link on the printed document). Data minimisation (ISO 27001 A.8.11,
   * A.8.12): it proves the document is genuine and unaltered, and identifies the stand and holder only by
   * initials. The buyer's national ID, phone, address and payment schedule are never returned here.
   */
  async verifyDocument(token) {
    const res = await this.db.query(
      `SELECT doc_type, document_number, signed_at, content, content_hash
       FROM issued_documents
       WHERE verification_token = $1`,
      [token]
    );
    if (res.rows.length === 0) throw notFound('Document verification record');
    const d = res.rows[0];
    const holder = d.content?.buyer ?? d.content?.owner ?? {};
    const initials = String(holder.name ?? '').split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
    return {
      doc_type: d.doc_type,
      document_number: d.document_number,
      signed_at: d.signed_at,
      signatory_role: d.content?.signatory?.role ?? null,
      content_hash: d.content_hash,
      stand_number: d.content?.property?.standNumber ?? null,
      scheme_name: d.content?.property?.schemeName ?? null,
      holder_initials: initials || null,
    };
  }
}
