import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, flatMarkupRates } from '../../src/schedule.js';
import { addMonths } from '../../src/dates.js';
import { signWebhook, checkWebhookSignature } from '../../src/signature.js';
import { toInternationalDigits } from '../../src/phone.js';
import { renderTemplate } from '../../src/messaging.js';

test('interest-free plan splits the balance exactly, last instalment absorbs rounding', () => {
  const s = buildSchedule({ financedCents: 100_000, termMonths: 3, startDate: '2026-10-08' });
  assert.deepEqual(s.installments.map((i) => i.principalCents), [33_333, 33_333, 33_334]);
  assert.equal(s.totalInterestCents, 0);
  assert.equal(s.effectiveAnnualRate, 0);
  assert.deepEqual(s.installments.map((i) => i.dueDate), ['2026-11-08', '2026-12-08', '2027-01-08']);
});

test('1.25% a month is a 16.08% effective annual rate, not ~11%', () => {
  const s = buildSchedule({ financedCents: 140_000, termMonths: 24, monthlyRateBps: 125, startDate: '2026-10-08' });
  assert.ok(Math.abs(s.effectiveAnnualRate - 0.160755) < 0.0002, `got ${s.effectiveAnnualRate}`);
  assert.equal(s.installments.reduce((t, i) => t + i.principalCents, 0), 140_000, 'principal sums to the financed amount');
  assert.ok(s.installments.every((i) => i.principalCents >= 0 && i.interestCents >= 0));
});

test('interest-free months lower the true rate but never below zero', () => {
  const full = buildSchedule({ financedCents: 140_000, termMonths: 24, monthlyRateBps: 125, startDate: '2026-10-08' });
  const grace = buildSchedule({ financedCents: 140_000, termMonths: 24, monthlyRateBps: 125, interestFreeMonths: 2, startDate: '2026-10-08' });
  assert.ok(grace.effectiveAnnualRate < full.effectiveAnnualRate);
  assert.ok(grace.effectiveAnnualRate > 0.13, `got ${grace.effectiveAnnualRate}`);
  assert.equal(grace.installments[0].interestCents, 0);
  assert.equal(grace.installments[1].interestCents, 0);
});

test('a 30% flat markup over 24 months costs ~30% a year, not "over 20%"', () => {
  const r = flatMarkupRates(100_000, 30, 24);
  assert.ok(r.effective > 0.29 && r.effective < 0.31, `got ${r.effective}`);
});

test('schedule rejects impossible terms', () => {
  assert.throws(() => buildSchedule({ financedCents: 0, termMonths: 12, startDate: '2026-10-08' }), RangeError);
  assert.throws(() => buildSchedule({ financedCents: 100, termMonths: 0, startDate: '2026-10-08' }), RangeError);
  assert.throws(() => buildSchedule({ financedCents: 100, termMonths: 6, interestFreeMonths: 7, startDate: '2026-10-08' }), RangeError);
});

test('month arithmetic clamps to month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-12-15', 2), '2027-02-15');
});

test('webhook signatures: valid, tampered, stale and unconfigured', () => {
  const secret = 'x'.repeat(32);
  const body = Buffer.from('{"reference":"EC-1"}');
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const sig = signWebhook(ts, body, secret);
  assert.equal(checkWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secret, now }), null);
  assert.equal(checkWebhookSignature({ rawBody: Buffer.from('{"reference":"EC-2"}'), timestamp: ts, signature: sig, secret, now }), 'BAD_SIGNATURE');
  assert.equal(checkWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secret, now: now + 600_000 }), 'STALE_TIMESTAMP');
  assert.equal(checkWebhookSignature({ rawBody: body, timestamp: ts, signature: sig, secret: undefined, now }), 'CHANNEL_NOT_CONFIGURED');
});

test('phone numbers normalise to international digits', () => {
  assert.equal(toInternationalDigits('+263 77 412 8901'), '263774128901');
  assert.equal(toInternationalDigits('0774 128 901'), '263774128901');
  assert.equal(toInternationalDigits('+44 7700 900123'), '447700900123');
  assert.equal(toInternationalDigits('00447700900123'), '447700900123');
  assert.equal(toInternationalDigits('12'), null);
});

test('templates refuse to render with missing values', () => {
  assert.throws(() => renderTemplate('PAYMENT_RECEIPT', { receipt: 'REC-1' }), /missing/);
  assert.match(renderTemplate('DEED_ISSUED', { name: 'Rudo', stand: '401', document: 'ZIM-DEED-000001' }), /Rudo.*ZIM-DEED-000001.*401/);
});
