import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createTestDatabase, insertStand } from '../helpers/db.js';
import { ApplicationService } from '../../src/applicationService.js';
import { AllocationService } from '../../src/allocationService.js';
import { PaymentService } from '../../src/paymentService.js';
import { IssuanceService } from '../../src/issuanceService.js';
import { createApp } from '../../src/app.js';

let db;
let app;
let services;
const config = {
  jwtSecret: 'test_super_secret_jwt_key_at_least_32_chars_long_2026',
  jwtIssuer: 'zimbuild',
  jwtAudience: 'zhms',
  corsOrigins: [],
  nationalIdChecksum: false
};

const makeToken = (sub, roles = []) => jwt.sign({ sub, roles }, config.jwtSecret, {
  issuer: config.jwtIssuer,
  audience: config.jwtAudience,
  expiresIn: '1h'
});

test.before(async () => {
  db = await createTestDatabase();
  services = {
    application: new ApplicationService(db, config),
    allocation: new AllocationService(db),
    payment: new PaymentService(db),
    issuance: new IssuanceService(db)
  };
  app = createApp(db, services, config);
});

test.after(async () => {
  await db.drop();
});

test('Full Lifecycle: Application -> 3-Step Approval -> 50% Deposit -> Agreement -> Full Pay -> Deed', async () => {
  // 1. Submit Application
  const applicantSub = 'usr_applicant_99';
  const appData = {
    nationalId: '63-199201-R-42',
    firstName: 'Kudzai',
    lastName: 'Chirwa',
    dateOfBirth: '1996-03-20',
    phoneNumber: '+263773123456',
    physicalAddress: '14 Highfield, Harare',
    preferredScheme: 'Budiriro Phase 4'
  };

  const appRecord = await services.application.submitApplication(applicantSub, appData);
  assert.equal(appRecord.status, 'PENDING_LAND_OFFICER');

  // 2. Step 1: Land Officer Approves
  const step1 = await services.application.reviewApplication(appRecord.application_id, 'LAND_OFFICER', 'officer_1', 'APPROVED');
  assert.equal(step1.status, 'PENDING_FINANCE');

  // 3. Step 2: Finance Manager Approves
  const step2 = await services.application.reviewApplication(appRecord.application_id, 'FINANCE_MANAGER', 'finance_1', 'APPROVED');
  assert.equal(step2.status, 'PENDING_CEO');

  // 4. Step 3: CEO Approves -> Final Status APPROVED
  const step3 = await services.application.reviewApplication(appRecord.application_id, 'CEO', 'ceo_1', 'APPROVED');
  assert.equal(step3.status, 'APPROVED');

  // 5. Reserve Stand (FCFS)
  const stand = await insertStand(db.pool, { price: '8000.00' });
  const alloc = await services.allocation.reserveStand({
    applicationId: appRecord.application_id,
    parcelId: stand.parcel_id,
    idempotencyKey: 'idemp_key_alloc_1',
    reservedBy: 'officer_1'
  });
  assert.equal(alloc.status, 'RESERVED');
  assert.equal(Number(alloc.deposit_required_usd), 4000.00); // 50% of 8000

  // 6. Pay Deposit (50% = $4000) via EcoCash
  const pay1 = await services.payment.recordPayment({
    allocationId: alloc.allocation_id,
    channel: 'ECOCASH',
    amountUsd: 4000.00,
    externalReference: 'EC-DEP-99201',
    recordedBy: 'finance_clerk_1'
  });
  assert.equal(pay1.newStatus, 'AWAITING_SIGNATURE');
  assert.equal(pay1.remainingBalanceUsd, 4000.00);

  // 7. CEO Signs Agreement of Sale
  const agreement = await services.issuance.signAgreementOfSale({
    allocationId: alloc.allocation_id,
    ceoSub: 'ceo_1'
  });
  assert.equal(agreement.status, 'ACTIVE');
  assert.ok(agreement.documentNumber.startsWith('ZIM-AOS-'));

  // 8. Public Verification of Agreement of Sale
  const verifiedAos = await services.issuance.verifyDocument(agreement.verificationToken);
  assert.equal(verifiedAos.document_number, agreement.documentNumber);

  // 9. Pay Remaining Balance ($4000) via Bank Transfer
  const pay2 = await services.payment.recordPayment({
    allocationId: alloc.allocation_id,
    channel: 'BANK_TRANSFER',
    amountUsd: 4000.00,
    externalReference: 'BT-FIN-88219',
    recordedBy: 'finance_clerk_1'
  });
  assert.equal(pay2.newStatus, 'PAID_IN_FULL');
  assert.equal(pay2.remainingBalanceUsd, 0.00);

  // 10. Title deed is blocked until the stand's servicing is 100% certified (ZNHSP)
  await assert.rejects(
    services.issuance.signDeedOfTransfer({ allocationId: alloc.allocation_id, ceoSub: 'ceo_1' }),
    (err) => err.code === 'SERVICING_NOT_CERTIFIED'
  );
  await db.pool.query(
    `UPDATE la_spatial_unit SET water_status = 'CERTIFIED', sewer_status = 'CERTIFIED', roads_status = 'CERTIFIED',
            servicing_certificate_ref = 'HCC/ENG/2026/0001' WHERE parcel_id = $1`, [stand.parcel_id]);

  // 10b. CEO Signs Title Deed
  const deed = await services.issuance.signDeedOfTransfer({
    allocationId: alloc.allocation_id,
    ceoSub: 'ceo_1'
  });
  assert.equal(deed.status, 'COMPLETED');
  assert.ok(deed.documentNumber.startsWith('ZIM-DEED-'));

  // 11. Public Verification of Deed
  const verifiedDeed = await services.issuance.verifyDocument(deed.verificationToken);
  assert.equal(verifiedDeed.document_number, deed.documentNumber);

  // 11b. Verification tokens unlock documents publicly: they must never be copied into the audit log.
  const { rows: [leak] } = await db.pool.query(
    `SELECT count(*)::int AS n FROM audit_log WHERE data::text LIKE '%' || $1 || '%' OR data::text LIKE '%' || $2 || '%'`,
    [agreement.verificationToken, deed.verificationToken]);
  assert.equal(leak.n, 0);

  // 12. Verify Audit Chain Cryptographic Integrity
  const { rows: auditCheck } = await db.pool.query('SELECT verify_audit_chain() AS invalid_block');
  assert.equal(auditCheck[0].invalid_block, null, 'Audit chain must have zero corrupted blocks');
});

test('Rejection & Resubmission Workflow: Restarts at Land Officer', async () => {
  const applicantSub = 'usr_applicant_rej';
  const app = await services.application.submitApplication(applicantSub, {
    nationalId: '08-112349-B-09',
    firstName: 'Farai',
    lastName: 'Ndlovu',
    dateOfBirth: '1998-11-20',
    phoneNumber: '+263774000111',
    physicalAddress: 'Bulawayo'
  });

  // Land officer approves
  await services.application.reviewApplication(app.application_id, 'LAND_OFFICER', 'officer_1', 'APPROVED');

  // Finance manager rejects with reason
  const rej = await services.application.reviewApplication(
    app.application_id,
    'FINANCE_MANAGER',
    'finance_1',
    'REJECTED',
    'Proof of employment/payslip is missing or unverified'
  );
  assert.equal(rej.status, 'RETURNED');

  // Applicant fixes and resubmits
  const resubmitted = await services.application.resubmitApplication(app.application_id, applicantSub, {
    notes: 'Uploaded verified payslip and bank statement'
  });
  // Must restart at Land Officer
  assert.equal(resubmitted.status, 'PENDING_LAND_OFFICER');
  assert.equal(resubmitted.round, 2);
});
