/**
 * Auto clock-in/clock-out for user "chisato".
 *
 * Designed to run every minute via scheduler (e.g. node-cron, Windows Task Scheduler, pm2).
 *
 * - Check-in:  3–5 minutes BEFORE shift start
 * - Check-out: 2–5 minutes AFTER shift end
 *
 * Usage:  tsx scripts/auto-clock-chisato.ts
 * Or:     npm run auto:clock
 */

import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { AttendanceStatus, PrismaClient } from "@prisma/client";

// ── Prisma setup (standalone, no @/lib alias) ──

function sqliteAdapterUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const withoutPrefix = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(withoutPrefix) ? withoutPrefix : path.resolve(process.cwd(), withoutPrefix);
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: sqliteAdapterUrl() }),
});

// ── Time helpers (VN timezone) ──

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

function vnParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function vnDateString(date: Date = new Date()) {
  const p = vnParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function vnMinuteOfDay(date: Date = new Date()) {
  const p = vnParts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

function parseHHMM(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function shiftWorkDate(workDate: string, delta: number) {
  const [y, m, d] = workDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Types ──

type WorkSchedule = {
  startTime: string;
  endTime: string;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  breakPolicyJson: string;
};

// ── Get active shift for user ──

async function getActiveShift(userId: string, atDate: Date): Promise<WorkSchedule | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workStartTime: true, workEndTime: true, lateGraceMinutes: true, earlyLeaveGraceMinutes: true, breakPolicyJson: true },
  });

  if (user?.workStartTime && user.workEndTime) {
    return {
      startTime: user.workStartTime,
      endTime: user.workEndTime,
      lateGraceMinutes: user.lateGraceMinutes,
      earlyLeaveGraceMinutes: user.earlyLeaveGraceMinutes,
      breakPolicyJson: user.breakPolicyJson,
    };
  }

  const assigned = await prisma.employeeShiftAssignment.findFirst({
    where: {
      userId,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
      shift: { isActive: true },
    },
    orderBy: { effectiveFrom: "desc" },
    select: { shift: { select: { startTime: true, endTime: true, lateGraceMinutes: true, earlyLeaveGraceMinutes: true, breakPolicyJson: true } } },
  });

  return assigned ? { ...assigned.shift } : null;
}

// ── Main logic ──

async function main() {
  const TARGET_USERNAME = "chisato";
  const CHECKIN_WINDOW = { minBefore: 3, maxBefore: 5 };   // 3–5 min before start
  const CHECKOUT_WINDOW = { minAfter: 2, maxAfter: 5 };    // 2–5 min after end

  const user = await prisma.user.findFirst({
    where: { username: TARGET_USERNAME, isActive: true, deletedAt: null },
  });

  if (!user) {
    console.log(`[auto-clock] User "${TARGET_USERNAME}" not found or inactive. Skipping.`);
    return;
  }

  const now = new Date();
  const today = vnDateString(now);
  const nowMinute = vnMinuteOfDay(now);

  const shift = await getActiveShift(user.id, now);
  if (!shift) {
    console.log(`[auto-clock] No active shift for "${TARGET_USERNAME}". Skipping.`);
    return;
  }

  const startMin = parseHHMM(shift.startTime);
  const endMin = parseHHMM(shift.endTime);
  const overnight = endMin <= startMin;

  // Check if month is locked
  const closure = await prisma.monthlyClosure.findUnique({ where: { month: today.slice(0, 7) } });
  if (closure && !closure.reopenedAt) {
    console.log(`[auto-clock] Month ${today.slice(0, 7)} is locked. Skipping.`);
    return;
  }

  // Get or check today's attendance
  const existing = await prisma.attendanceDay.findUnique({
    where: { userId_workDate: { userId: user.id, workDate: today } },
  });

  // ── AUTO CHECK-IN ──
  // Window: (startMin - maxBefore) to (startMin - minBefore), i.e. 5 to 3 minutes before start
  const checkinWindowStart = startMin - CHECKIN_WINDOW.maxBefore;
  const checkinWindowEnd = startMin - CHECKIN_WINDOW.minBefore;

  if (nowMinute >= checkinWindowStart && nowMinute <= checkinWindowEnd) {
    if (existing?.checkInAt) {
      console.log(`[auto-clock] Already checked in for ${today}. Skipping check-in.`);
    } else if (existing?.isOffDay) {
      console.log(`[auto-clock] Off day for ${today}. Skipping check-in.`);
    } else {
      // Add random offset seconds for natural appearance
      const offsetSeconds = randomInt(0, 59);
      const checkInTime = new Date(now.getTime() + offsetSeconds * 1000);

      await prisma.$transaction(async (tx) => {
        const attendance = existing ?? await tx.attendanceDay.create({
          data: {
            userId: user.id,
            workDate: today,
            status: AttendanceStatus.INCOMPLETE,
            warningFlagsJson: "[]",
            lockedMonth: false,
          },
        });

        await tx.attendanceDay.update({
          where: { id: attendance.id },
          data: {
            checkInAt: checkInTime,
            status: AttendanceStatus.PRESENT,
            warningFlagsJson: "[]",
            updatedBy: user.id,
          },
        });
      });

      console.log(`[auto-clock] ✓ Check-in for "${TARGET_USERNAME}" at ${checkInTime.toLocaleTimeString("vi-VN", { timeZone: VN_TIMEZONE })} on ${today}`);
    }
    return;
  }

  // ── AUTO CHECK-OUT ──
  // For normal shift: window is (endMin + minAfter) to (endMin + maxAfter)
  // For overnight shift: endMin is next-day morning, handle separately
  let checkoutWindowStart: number;
  let checkoutWindowEnd: number;

  if (overnight) {
    // Overnight: end time is in the morning. Check if we're in the morning of "next day"
    // We handle checkout for yesterday's check-in
    const yesterday = shiftWorkDate(today, -1);
    const yesterdayAttendance = await prisma.attendanceDay.findUnique({
      where: { userId_workDate: { userId: user.id, workDate: yesterday } },
    });

    checkoutWindowStart = endMin + CHECKOUT_WINDOW.minAfter;
    checkoutWindowEnd = endMin + CHECKOUT_WINDOW.maxAfter;

    if (nowMinute >= checkoutWindowStart && nowMinute <= checkoutWindowEnd) {
      if (yesterdayAttendance?.checkInAt && !yesterdayAttendance.checkOutAt) {
        const offsetSeconds = randomInt(0, 59);
        const checkOutTime = new Date(now.getTime() + offsetSeconds * 1000);

        await prisma.$transaction(async (tx) => {
          const updated = await tx.attendanceDay.update({
            where: { id: yesterdayAttendance.id },
            data: { checkOutAt: checkOutTime, updatedBy: user.id },
          });

          // Recalculate
          const breaks = await tx.breakSession.findMany({
            where: { attendanceDayId: updated.id, endAt: { not: null } },
          });
          const totalBreak = breaks.reduce((acc, b) => acc + (b.durationMinutesComputed ?? 0), 0);
          const workedMinutes = Math.max(0, minutesBetween(updated.checkInAt!, checkOutTime) - totalBreak);

          await tx.attendanceDay.update({
            where: { id: updated.id },
            data: { workedMinutes, status: AttendanceStatus.PRESENT, warningFlagsJson: "[]" },
          });
        });

        console.log(`[auto-clock] ✓ Check-out (overnight) for "${TARGET_USERNAME}" at ${now.toLocaleTimeString("vi-VN", { timeZone: VN_TIMEZONE })} for ${yesterday}`);
      } else {
        console.log(`[auto-clock] No open overnight attendance for yesterday. Skipping.`);
      }
    }
    return;
  }

  // Normal (same-day) shift checkout
  checkoutWindowStart = endMin + CHECKOUT_WINDOW.minAfter;
  checkoutWindowEnd = endMin + CHECKOUT_WINDOW.maxAfter;

  if (nowMinute >= checkoutWindowStart && nowMinute <= checkoutWindowEnd) {
    if (!existing?.checkInAt) {
      console.log(`[auto-clock] Not checked in for ${today}. Skipping check-out.`);
    } else if (existing.checkOutAt) {
      console.log(`[auto-clock] Already checked out for ${today}. Skipping.`);
    } else {
      // Close any open break sessions first
      const openBreak = await prisma.breakSession.findFirst({
        where: { attendanceDayId: existing.id, endAt: null },
      });
      if (openBreak) {
        const breakEnd = new Date(now.getTime() - randomInt(60, 180) * 1000);
        await prisma.breakSession.update({
          where: { id: openBreak.id },
          data: { endAt: breakEnd, durationMinutesComputed: minutesBetween(openBreak.startAt, breakEnd) },
        });
      }

      const offsetSeconds = randomInt(0, 59);
      const checkOutTime = new Date(now.getTime() + offsetSeconds * 1000);

      await prisma.$transaction(async (tx) => {
        const updated = await tx.attendanceDay.update({
          where: { id: existing.id },
          data: { checkOutAt: checkOutTime, updatedBy: user.id },
        });

        const breaks = await tx.breakSession.findMany({
          where: { attendanceDayId: updated.id, endAt: { not: null } },
        });
        const totalBreak = breaks.reduce((acc, b) => acc + (b.durationMinutesComputed ?? 0), 0);
        const workedMinutes = Math.max(0, minutesBetween(updated.checkInAt!, checkOutTime) - totalBreak);

        await tx.attendanceDay.update({
          where: { id: updated.id },
          data: { workedMinutes, status: AttendanceStatus.PRESENT, warningFlagsJson: "[]" },
        });
      });

      console.log(`[auto-clock] ✓ Check-out for "${TARGET_USERNAME}" at ${checkOutTime.toLocaleTimeString("vi-VN", { timeZone: VN_TIMEZONE })} on ${today}`);
    }
    return;
  }

  console.log(`[auto-clock] Not in any action window. Now=${nowMinute}min, CheckIn=[${checkinWindowStart}-${checkinWindowEnd}], CheckOut=[${checkoutWindowStart}-${checkoutWindowEnd}]. Skipping.`);
}

main()
  .catch((err) => console.error("[auto-clock] Error:", err))
  .finally(() => prisma.$disconnect());
