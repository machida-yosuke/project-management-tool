const MINUTE = 60_000;
const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
];

const formatter = new Intl.RelativeTimeFormat('ja', { numeric: 'always' });

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  // Clock skew can put server timestamps slightly in the future; treat that as "now".
  if (elapsed < MINUTE) return 'たった今';
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return formatter.format(-Math.floor(elapsed / ms), unit);
  }
  return formatter.format(-Math.floor(elapsed / MINUTE), 'minute');
}
