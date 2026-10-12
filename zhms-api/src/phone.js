/**
 * Normalises a phone number to international digits without "+" (the form WhatsApp and most SMS
 * gateways expect). Local Zimbabwean numbers ("0774 123 456") get the 263 country code;
 * numbers already carrying a country code (diaspora buyers) are kept as they are.
 * Returns null when the number is not usable.
 */
export function toInternationalDigits(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = '263' + digits.slice(1);
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
