import { createHash } from 'node:crypto';

/**
 * Security event log (ISO 27001 A.8.15 / A.8.16). One JSON line per event on stdout, for the log shipper /
 * SIEM. Business changes go to the hash-chained audit_log; this stream covers what never reaches the
 * database: failed sign-ins, refused permissions, rejected webhook signatures, issued tokens.
 *
 * Never pass tokens, secrets, national IDs, phone numbers or request bodies. Subjects are pseudonymised.
 */
export const pseudonym = (value) =>
  value ? createHash('sha256').update(String(value)).digest('hex').slice(0, 16) : null;

/** "+263774128901" -> "+2637******01": enough to tell numbers apart in an incident, not to contact anyone. */
export const maskPhone = (phone) => {
  const s = String(phone ?? '');
  return s.length <= 6 ? '***' : `${s.slice(0, 5)}${'*'.repeat(s.length - 7)}${s.slice(-2)}`;
};

export function securityEvent(event, { req, outcome = 'DENIED', ...fields } = {}) {
  const line = {
    level: outcome === 'SUCCESS' ? 'info' : 'warn',
    type: 'security',
    event,
    outcome,
    at: new Date().toISOString(),
    ...(req && { method: req.method, path: req.path, ip: req.ip, actor: pseudonym(req.user?.sub) }),
    ...fields,
  };
  console.log(JSON.stringify(line));
}
