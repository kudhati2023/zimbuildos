// Calendar helpers on 'YYYY-MM-DD' strings so due dates never drift across timezones.

const harare = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in Zimbabwe as 'YYYY-MM-DD'. */
export const todayHarare = (now = new Date()) => harare.format(now);

const parse = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new RangeError(`Invalid date: ${ymd}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const fmt = (d) => d.toISOString().slice(0, 10);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

/** Adds calendar months, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ymd, n) {
  const [y, m, d] = parse(ymd);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fmt(new Date(Date.UTC(ty, tm - 1, Math.min(d, daysInMonth(ty, tm)))));
}

export function addDays(ymd, n) {
  const [y, m, d] = parse(ymd);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}
