import { createHmac, timingSafeEqual } from 'node:crypto';

// Payment gateway webhooks are signed with a per-channel shared secret:
//   X-ZHMS-Timestamp: <unix seconds>
//   X-ZHMS-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
// The timestamp is part of the signed payload, so a captured request cannot be replayed later.
export const MAX_SKEW_SECONDS = 300;

export const signWebhook = (timestamp, rawBody, secret) =>
  'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');

/** Returns null when valid, otherwise a short reason. */
export function checkWebhookSignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (!secret) return 'CHANNEL_NOT_CONFIGURED';
  if (!rawBody || !timestamp || !signature) return 'MISSING_SIGNATURE';
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return 'STALE_TIMESTAMP';
  const expected = Buffer.from(signWebhook(timestamp, rawBody, secret));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given) ? null : 'BAD_SIGNATURE';
}
