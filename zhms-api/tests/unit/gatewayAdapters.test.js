import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentGatewayAdapter } from '../../src/gatewayAdapters.js';
import { signWebhook, checkWebhookSignature } from '../../src/signature.js';

test('PaymentGatewayAdapter: EcoCash callback normalisation', () => {
  const rawEcoCash = {
    ecocashReference: 'EC-99881122',
    clientCorrelator: 'ZB-BUD2-401',
    amount: 150.00,
    currency: 'USD',
    transactionStatus: 'Completed',
    dateTime: '2026-10-12T10:30:00.000Z',
    sourceMsisdn: '263774128901'
  };

  const canonical = PaymentGatewayAdapter.normaliseEcoCash(rawEcoCash);
  assert.equal(canonical.reference, 'EC-99881122');
  assert.equal(canonical.accountRef, 'ZB-BUD2-401');
  assert.equal(canonical.amount, '150.00');
  assert.equal(canonical.currency, 'USD');
  assert.equal(canonical.status, 'SUCCESS');
  assert.equal(canonical.payerPhone, '+263774128901');
});

test('PaymentGatewayAdapter: OneMoney callback normalisation', () => {
  const rawOneMoney = {
    reference: 'OM-445566',
    subscriber: '263712345678',
    amount: '350.50',
    currency: 'ZWG',
    merchant_reference: 'ZB-MID-001',
    status_code: '00',
    timestamp: '2026-10-12T11:00:00.000Z'
  };

  const canonical = PaymentGatewayAdapter.normaliseOneMoney(rawOneMoney);
  assert.equal(canonical.reference, 'OM-445566');
  assert.equal(canonical.accountRef, 'ZB-MID-001');
  assert.equal(canonical.amount, '350.50');
  assert.equal(canonical.currency, 'ZWG');
  assert.equal(canonical.status, 'SUCCESS');
  assert.equal(canonical.payerPhone, '+263712345678');
});

test('PaymentGatewayAdapter: Innbucks callback normalisation', () => {
  const rawInnbucks = {
    innbucks_token: 'IB-992211',
    order_id: 'ZB-HIG-201',
    amount_paid: 200.00,
    currency_code: 'USD',
    state: 'SETTLED',
    customer_cell: '+263773998877',
    settled_at: '2026-10-12T11:15:00.000Z'
  };

  const canonical = PaymentGatewayAdapter.normaliseInnbucks(rawInnbucks);
  assert.equal(canonical.reference, 'IB-992211');
  assert.equal(canonical.accountRef, 'ZB-HIG-201');
  assert.equal(canonical.amount, '200.00');
  assert.equal(canonical.currency, 'USD');
  assert.equal(canonical.status, 'SUCCESS');
  assert.equal(canonical.payerPhone, '+263773998877');
});

test('PaymentGatewayAdapter: signed webhook request generation and verification', () => {
  const secret = 'test_secret_key_at_least_32_characters_long_for_signing';
  const canonical = {
    reference: 'EC-SIGN-TEST-1',
    accountRef: 'ZB-BUD2-401',
    amount: '50.00',
    currency: 'USD',
    status: 'SUCCESS'
  };

  const ts = Math.floor(Date.now() / 1000);
  const signedReq = PaymentGatewayAdapter.createSignedWebhookRequest(canonical, 'ECOCASH', secret, ts);

  const check = checkWebhookSignature({
    rawBody: signedReq.rawBody,
    timestamp: signedReq.headers['x-zhms-timestamp'],
    signature: signedReq.headers['x-zhms-signature'],
    secret,
    now: ts * 1000
  });

  assert.equal(check, null, 'Signature should be valid');
});
