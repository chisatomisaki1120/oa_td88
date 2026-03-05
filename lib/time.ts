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
