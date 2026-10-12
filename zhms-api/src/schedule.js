import { addMonths } from './dates.js';

/**
 * Builds the monthly instalment schedule for the balance still owed after the deposit.
 *
 * Equal monthly payments on a reducing balance at `monthlyRateBps` (125 = 1.25% per month);
 * the first `interestFreeMonths` months accrue no interest. All amounts are integer cents and the
 * last instalment absorbs rounding so principal always sums to exactly `financedCents`.
 */
export function buildSchedule({ financedCents, termMonths, monthlyRateBps = 0, interestFreeMonths = 0, startDate }) {
  if (!Number.isSafeInteger(financedCents) || financedCents <= 0) throw new RangeError('financedCents must be a positive integer');
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) throw new RangeError('termMonths must be 1-120');
  if (!Number.isInteger(monthlyRateBps) || monthlyRateBps < 0 || monthlyRateBps > 1000) throw new RangeError('monthlyRateBps must be 0-1000');
  if (!Number.isInteger(interestFreeMonths) || interestFreeMonths < 0 || interestFreeMonths > termMonths) {
    throw new RangeError('interestFreeMonths must be between 0 and termMonths');
  }

  const r = monthlyRateBps / 10_000;
  const rates = Array.from({ length: termMonths }, (_, k) => (k < interestFreeMonths ? 0 : r));

  // Level payment P solving: financed = Σ_k P / Π_{i<=k}(1 + r_i)
  let discount = 1;
  let sumInverse = 0;
  for (const rk of rates) {
    discount *= 1 + rk;
    sumInverse += 1 / discount;
  }
  const payment = Math.round(financedCents / sumInverse);

  const installments = [];
  let balance = financedCents;
  for (let k = 1; k <= termMonths; k++) {
    const interestCents = Math.round(balance * rates[k - 1]);
    const principalCents = k === termMonths ? balance : Math.min(balance, payment - interestCents);
    balance -= principalCents;
    installments.push({ seq: k, dueDate: addMonths(startDate, k), principalCents, interestCents });
  }

  const totalInterestCents = installments.reduce((s, i) => s + i.interestCents, 0);
  const { effective, nominal } = annualise(monthlyIrr(financedCents, installments.map((i) => i.principalCents + i.interestCents)));
  return {
    installments,
    monthlyPaymentCents: payment,
    totalInterestCents,
    totalRepayableCents: financedCents + totalInterestCents,
    effectiveAnnualRate: effective,
    nominalAnnualRate: nominal,
  };
}

/** Monthly IRR of borrowing `principal` and repaying payments[k] at month k+1 (bisection). */
export function monthlyIrr(principal, payments) {
  if (principal <= 0) return 0;
  const total = payments.reduce((s, p) => s + p, 0);
  if (total <= principal) return 0;
  const npv = (i) => payments.reduce((s, p, k) => s + p / (1 + i) ** (k + 1), 0) - principal;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 100; n++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const round6 = (x) => Math.round(x * 1e6) / 1e6;

/** Effective annual rate (compounded) and nominal APR from a monthly rate. */
export const annualise = (monthly) => ({ effective: round6((1 + monthly) ** 12 - 1), nominal: round6(monthly * 12) });

/** True annual cost of a "flat markup" offer, e.g. +30% on the balance split over 24 equal months. */
export function flatMarkupRates(financedCents, markupPercent, termMonths) {
  const payment = (financedCents * (1 + markupPercent / 100)) / termMonths;
  return annualise(monthlyIrr(financedCents, Array(termMonths).fill(payment)));
}
