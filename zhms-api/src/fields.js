import { badRequest } from './errors.js';
import { toCents, centsToNumeric } from './money.js';

// Request-field parsers for the construction modules. Each returns a clean value or throws a 400
// naming the field, so services never see half-validated input.

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const QTY_RE = /^\d{1,11}(\.\d{1,3})?$/;
const RATE_RE = /^\d{1,10}(\.\d{1,4})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function text(value, field, { max = 2000, optional = false, min = 1 } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (optional) return null;
    throw badRequest('INVALID_FIELD', `${field} is required`);
  }
  if (typeof value !== 'string') throw badRequest('INVALID_FIELD', `${field} must be text`);
  const s = value.trim();
  if (s.length < min) throw badRequest('INVALID_FIELD', `${field} must be at least ${min} characters`);
  if (s.length > max) throw badRequest('INVALID_FIELD', `${field} must be at most ${max} characters`);
  return s;
}

export function code(value, field, re = /^[A-Z0-9][A-Z0-9.\-/]{0,29}$/) {
  const s = text(value, field, { max: 30 }).toUpperCase();
  if (!re.test(s)) throw badRequest('INVALID_FIELD', `${field} may contain only letters, digits, '.', '-' or '/'`);
  return s;
}

export function oneOf(value, field, allowed, { optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    if (optional) return null;
  }
  if (!allowed.includes(value)) throw badRequest('INVALID_FIELD', `${field} must be one of ${allowed.join(', ')}`);
  return value;
}

export function date(value, field, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest('INVALID_FIELD', `${field} is required (YYYY-MM-DD)`);
  }
  const s = String(value);
  const d = new Date(`${s}T00:00:00Z`);
  if (!YMD_RE.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw badRequest('INVALID_FIELD', `${field} must be a real date as YYYY-MM-DD`);
  }
  return s;
}

export function uuid(value, field, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw badRequest('INVALID_FIELD', `${field} is required`);
  }
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw badRequest('INVALID_FIELD', `${field} must be a valid id`);
  return value;
}

export function int(value, field, { min = 0, max = 1_000_000, optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    if (optional) return null;
    throw badRequest('INVALID_FIELD', `${field} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest('INVALID_FIELD', `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

/** Decimal in [min, max] with at most `decimals` places, returned as a string for PostgreSQL numeric. */
export function decimal(value, field, { min = 0, max = 100, decimals = 2, optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    if (optional) return null;
    throw badRequest('INVALID_FIELD', `${field} is required`);
  }
  const s = String(value).trim();
  const re = new RegExp(`^\\d{1,10}(\\.\\d{1,${decimals}})?$`);
  if (!re.test(s) || Number(s) < min || Number(s) > max) {
    throw badRequest('INVALID_FIELD', `${field} must be a number from ${min} to ${max} with at most ${decimals} decimals`);
  }
  return s;
}

/** Positive quantity (up to 3 decimals), as a numeric string. */
export function quantity(value, field = 'quantity') {
  const s = String(value ?? '').trim();
  if (!QTY_RE.test(s) || Number(s) <= 0) throw badRequest('INVALID_QUANTITY', `${field} must be a positive number with at most 3 decimals`);
  return s;
}

/** Unit rate in USD (up to 4 decimals, zero allowed for free-issue items), as a numeric string. */
export function rate(value, field = 'unitRateUsd') {
  const s = String(value ?? '').trim();
  if (!RATE_RE.test(s)) throw badRequest('INVALID_RATE', `${field} must be a USD rate with at most 4 decimals`);
  return s;
}

/** Positive USD amount as a numeric string. */
export const usdAmount = (value) => centsToNumeric(toCents(value));

/** Signed, non-zero USD amount (budget adjustments, contract variations), as a numeric string. */
export function signedUsd(value, field = 'amountUsd') {
  const s = String(value ?? '').trim();
  const neg = s.startsWith('-');
  let cents;
  try { cents = toCents(neg ? s.slice(1) : s); } catch {
    throw badRequest('INVALID_AMOUNT', `${field} must be a non-zero USD amount (negative to reduce) with at most 2 decimals`);
  }
  return centsToNumeric(neg ? -cents : cents);
}

/** Converts a numeric string to a JS number for report payloads (display values only, never re-stored). */
export const num = (v) => (v === null || v === undefined ? null : Number(v));
