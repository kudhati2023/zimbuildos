// National ID handling.
//
// FORMAT (verified): Zimbabwean IDs look like  DD-NNNNNN[N]-L-DD  (district, serial, check letter, district-of-origin).
// CHECK LETTER (UNVERIFIED): I have no authoritative source for the Registrar-General's check-letter algorithm.
// The mod-23 routine below is a hypothesis and is therefore OFF by default (ZW_ID_CHECKSUM=off).
// Do not enable it in production until the Registrar-General's algorithm is confirmed against real IDs.
const ID_RE = /^(\d{2})(\d{6,7})([A-Z])(\d{2})$/;
const HYPOTHETICAL_LETTERS = 'ABCDEFGHJKLMNPQRSTVWXYZ';

/** Returns the canonical "DD-NNNNNN-L-DD" form, or null if the format is invalid. */
export function normalizeNationalId(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toUpperCase().replace(/[\s-]/g, '').match(ID_RE);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null;
}

/** Hypothetical mod-23 check. Exported for experimentation only; see note above. */
export function hypotheticalCheckLetterMatches(canonicalId) {
  const m = canonicalId?.replace(/-/g, '').match(ID_RE);
  if (!m) return false;
  return HYPOTHETICAL_LETTERS[Number(BigInt(`${m[1]}${m[2]}`) % 23n)] === m[3];
}

export function validateNationalId(raw, { checksum = false } = {}) {
  const id = normalizeNationalId(raw);
  if (!id) return { valid: false, reason: 'FORMAT' };
  if (checksum && !hypotheticalCheckLetterMatches(id)) return { valid: false, reason: 'CHECK_LETTER' };
  return { valid: true, id };
}

/** Whole years completed on `onDate` (both 'YYYY-MM-DD' or Date, evaluated in UTC). */
export function ageOn(dateOfBirth, onDate = new Date()) {
  const dob = new Date(dateOfBirth);
  const on = new Date(onDate);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(on.getTime())) return NaN;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = on.getUTCMonth() < dob.getUTCMonth()
    || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
