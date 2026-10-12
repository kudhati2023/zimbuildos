import { badRequest } from './errors.js';

// All money is handled as integer cents in code; PostgreSQL numeric(12,2) is the source of truth.
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** Parses a user-supplied USD amount ("50", "50.5", 50.25) into positive integer cents. */
export function toCents(value) {
  const s = String(value ?? '').trim();
  if (!AMOUNT_RE.test(s)) throw badRequest('INVALID_AMOUNT', 'Amount must be a positive USD value with at most 2 decimals');
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (cents <= 0) throw badRequest('INVALID_AMOUNT', 'Amount must be greater than zero');
  return cents;
}

/** Converts a PostgreSQL numeric string ("1234.50") to integer cents without float drift. */
export function numericToCents(numeric) {
  const s = String(numeric);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const c = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -c : c;
}

export const centsToNumeric = (cents) => {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/** percent of cents, rounded half up (e.g. the 50% deposit). */
export const percentOf = (cents, percent) => Math.round((cents * percent) / 100);
