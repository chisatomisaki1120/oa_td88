export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

function toParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function vnDateString(date: Date = new Date()): string {
  const p = toParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function vnMonthString(date: Date = new Date()): string {
  const p = toParts(date);
  return `${p.year}-${p.month}`;
}

export function vnMinuteOfDay(date: Date = new Date()): number {
  const p = toParts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function parseHHMM(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function parseWorkDateToUtc(workDate: string): Date {
  return new Date(`${workDate}T00:00:00.000+07:00`);
}

export function monthFromWorkDate(workDate: string): string {
  return workDate.slice(0, 7);
}

export function shiftWorkDate(workDate: string, deltaDays: number): string {
  const [year, month, day] = workDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + deltaDays);
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Validate that a YYYY-MM-DD string is a real calendar date */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

// ── Client-side display helpers (24h, VN timezone) ──

const DATETIME_FMT: Intl.DateTimeFormatOptions = {
  timeZone: VN_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  timeZone: VN_TIMEZONE,
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
};

/** Format a date value to "DD/MM/YYYY, HH:mm:ss" in VN timezone, 24h */
export function fmtDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("vi-VN", DATETIME_FMT);
}

/** Format a date value to "HH:mm:ss" in VN timezone, 24h */
export function fmtTime(value: string | Date): string {
  return new Date(value).toLocaleString("vi-VN", TIME_FMT);
}

/** Format minutes to "Xh" or "XhYp" (e.g. 8h, 8h30p) */
export function fmtMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? m + "p" : ""}`;
}

// ── Month option helpers (client-side UI selectors) ──

const SYSTEM_START_YEAR = 2026;
const SYSTEM_START_MONTH = 3;

/** Build descending list of "YYYY-MM" strings from current month back to system start */
export function buildMonthOptions(): string[] {
  const now = new Date().toLocaleDateString("en-CA", { timeZone: VN_TIMEZONE });
  const [cy, cm] = now.split("-").map(Number);
  const currentKey = cy * 12 + cm;
  const startKey = SYSTEM_START_YEAR * 12 + SYSTEM_START_MONTH;
  const opts: string[] = [];
  for (let k = currentKey; k >= startKey; k--) {
    const y = Math.floor((k - 1) / 12);
    const m = ((k - 1) % 12) + 1;
    opts.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return opts;
}

/** Get current month string "YYYY-MM" in VN timezone */
export function currentMonthVn(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: VN_TIMEZONE }).slice(0, 7);
}

/** Get current date string "YYYY-MM-DD" in VN timezone */
export function currentDateVn(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: VN_TIMEZONE });
}
