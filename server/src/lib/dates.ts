/**
 * All calendar math uses UTC dates only (YYYY-MM-DD strings from MySQL DATE
 * columns) so a subscription's period boundaries never depend on server TZ.
 */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInUtcMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Adds one billing interval, clamping short months and retaining an optional anniversary day. */
export function addIntervalIso(
  iso: string,
  unit: "DAY" | "WEEK" | "MONTH" | "YEAR",
  count: number,
  anchorDay = Number(iso.slice(8, 10)),
): string {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new RangeError("Billing anchor day must be from 1 to 31.");
  }
  const date = new Date(`${iso}T00:00:00Z`);
  switch (unit) {
    case "DAY":
      date.setUTCDate(date.getUTCDate() + count);
      break;
    case "WEEK":
      date.setUTCDate(date.getUTCDate() + 7 * count);
      break;
    case "MONTH": {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + count);
      date.setUTCDate(Math.min(anchorDay, daysInUtcMonth(date)));
      break;
    }
    case "YEAR": {
      date.setUTCDate(1);
      date.setUTCFullYear(date.getUTCFullYear() + count);
      date.setUTCDate(Math.min(anchorDay, daysInUtcMonth(date)));
      break;
    }
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Parses "YYYY-MM-DD HH:MM:SS" (MySQL, UTC), a bare "YYYY-MM-DD" date, or an
 * ISO timestamp into a Date. A date-only value means midnight UTC — appending
 * "Z" to it directly would produce an Invalid Date.
 */
export function parseUtc(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const withTime = normalized.length === 10 ? `${normalized}T00:00:00` : normalized;
  return new Date(withTime.endsWith("Z") ? withTime : `${withTime}Z`);
}

/** Formats a Date back into the MySQL UTC datetime string form. */
export function mysqlUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
