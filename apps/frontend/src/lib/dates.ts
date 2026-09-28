export type DateString = string;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

export function isDateString(value: string): boolean {
  // Round-tripping rejects out-of-range parts such as 2026-02-30 that Date.UTC would roll over.
  return DATE_PATTERN.test(value) && fromDayNumber(toDayNumber(value)) === value;
}

export function parseDate(value: DateString): DateParts {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid date string: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatDate({ year, month, day }: DateParts): DateString {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toDayNumber(value: DateString): number {
  const { year, month, day } = parseDate(value);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromDayNumber(dayNumber: number): DateString {
  const date = new Date(dayNumber * MS_PER_DAY);
  return formatDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addDays(value: DateString, days: number): DateString {
  return fromDayNumber(toDayNumber(value) + days);
}

/** Number of days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateString, to: DateString): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function mondayIndex(value: DateString): number {
  // Day 0 (1970-01-01) was a Thursday, which is index 3 in a Monday-first week.
  return (((toDayNumber(value) + 3) % 7) + 7) % 7;
}

export function startOfWeek(value: DateString): DateString {
  return addDays(value, -mondayIndex(value));
}

export function weekOf(value: DateString): DateString[] {
  const start = startOfWeek(value);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDays(year: number, month: number): DateString[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) =>
    formatDate({ year, month, day: i + 1 }),
  );
}

export function addMonths(value: DateString, months: number): DateString {
  const { year, month, day } = parseDate(value);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  return formatDate({
    year: nextYear,
    month: nextMonth,
    day: Math.min(day, daysInMonth(nextYear, nextMonth)),
  });
}

export function todayString(): DateString {
  const now = new Date();
  return formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function isSameMonth(value: DateString, year: number, month: number): boolean {
  const parts = parseDate(value);
  return parts.year === year && parts.month === month;
}

export function formatMonthLabel(value: DateString): string {
  const { year, month } = parseDate(value);
  return `${year}年${month}月`;
}

export function formatWeekRangeLabel(weekStart: DateString): string {
  const start = parseDate(weekStart);
  const end = parseDate(addDays(weekStart, 6));
  const endYear = end.year === start.year ? '' : `${end.year}年`;
  return `${start.year}年${start.month}月${start.day}日〜${endYear}${end.month}月${end.day}日`;
}

export function formatShortDay(value: DateString): string {
  const { month, day } = parseDate(value);
  return `${month}/${day}`;
}
