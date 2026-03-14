import { AttendanceDay, AttendanceStatus, BreakSession, BreakType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { minutesBetween, parseHHMM, shiftWorkDate, vnDateString, vnMinuteOfDay, parseWorkDateToUtc } from "@/lib/time";

export type BreakPolicy = {
  wc: { maxCount: number; maxMinutesEach: number };
  smoke: { maxCount: number; maxMinutesEach: number };
  meal: { maxCount: number; maxMinutesEach: number };
};

export type WorkSchedule = {
  startTime: string;
  endTime: string;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  breakPolicyJson: string;
};

export const DEFAULT_BREAK_POLICY: BreakPolicy = {
  wc: { maxCount: 3, maxMinutesEach: 10 },
  smoke: { maxCount: 2, maxMinutesEach: 10 },
  meal: { maxCount: 2, maxMinutesEach: 40 },
};

export async function getActiveShiftForUser(userId: string, atDate: Date = new Date(), tx?: Prisma.TransactionClient): Promise<WorkSchedule | null> {
  const db = tx ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      workStartTime: true,
      workEndTime: true,
      lateGraceMinutes: true,
      earlyLeaveGraceMinutes: true,
      breakPolicyJson: true,
    },
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

  const assigned = await db.employeeShiftAssignment.findFirst({
    where: {
      userId,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
      shift: { isActive: true },
    },
    orderBy: { effectiveFrom: "desc" },
    select: {
      shift: {
        select: {
          startTime: true,
          endTime: true,
          lateGraceMinutes: true,
          earlyLeaveGraceMinutes: true,
          breakPolicyJson: true,
        },
      },
    },
  });

  if (!assigned) return null;

  return {
    startTime: assigned.shift.startTime,
    endTime: assigned.shift.endTime,
    lateGraceMinutes: assigned.shift.lateGraceMinutes,
    earlyLeaveGraceMinutes: assigned.shift.earlyLeaveGraceMinutes,
    breakPolicyJson: assigned.shift.breakPolicyJson,
  };
}

function getBreakPolicy(schedule: WorkSchedule | null): BreakPolicy {
  if (!schedule) return DEFAULT_BREAK_POLICY;
  try {
    const raw = JSON.parse(schedule.breakPolicyJson);
    return {
      wc: { maxCount: raw?.wc?.maxCount ?? DEFAULT_BREAK_POLICY.wc.maxCount, maxMinutesEach: raw?.wc?.maxMinutesEach ?? DEFAULT_BREAK_POLICY.wc.maxMinutesEach },
      smoke: { maxCount: raw?.smoke?.maxCount ?? DEFAULT_BREAK_POLICY.smoke.maxCount, maxMinutesEach: raw?.smoke?.maxMinutesEach ?? DEFAULT_BREAK_POLICY.smoke.maxMinutesEach },
      meal: { maxCount: raw?.meal?.maxCount ?? DEFAULT_BREAK_POLICY.meal.maxCount, maxMinutesEach: raw?.meal?.maxMinutesEach ?? DEFAULT_BREAK_POLICY.meal.maxMinutesEach },
    };
  } catch {
    return DEFAULT_BREAK_POLICY;
  }
}

function calculateWarnings(breaks: BreakSession[], policy: BreakPolicy): string[] {
  const warnings: string[] = [];
  const wcs = breaks.filter((b) => b.breakType === BreakType.WC);
  const smokes = breaks.filter((b) => b.breakType === BreakType.SMOKE);
  const meals = breaks.filter((b) => b.breakType === BreakType.MEAL);

  if (wcs.length > policy.wc.maxCount) warnings.push("WC_COUNT_EXCEEDED");
  if (smokes.length > policy.smoke.maxCount) warnings.push("SMOKE_COUNT_EXCEEDED");
  if (meals.length > policy.meal.maxCount) warnings.push("MEAL_COUNT_EXCEEDED");

  if (wcs.some((b) => (b.durationMinutesComputed ?? 0) > policy.wc.maxMinutesEach)) {
    warnings.push("WC_DURATION_EXCEEDED");
  }
  if (smokes.some((b) => (b.durationMinutesComputed ?? 0) > policy.smoke.maxMinutesEach)) {
    warnings.push("SMOKE_DURATION_EXCEEDED");
  }
  if (meals.some((b) => (b.durationMinutesComputed ?? 0) > policy.meal.maxMinutesEach)) {
    warnings.push("MEAL_DURATION_EXCEEDED");
  }

  return warnings;
}

export function parseWarnings(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function computeCheckInStatus(schedule: WorkSchedule | null, checkInAt: Date): AttendanceStatus {
  if (!schedule) return AttendanceStatus.PRESENT;
  return vnMinuteOfDay(checkInAt) > parseHHMM(schedule.startTime) + schedule.lateGraceMinutes
    ? AttendanceStatus.LATE
    : AttendanceStatus.PRESENT;
}

function isOvernightShift(schedule: WorkSchedule | null): boolean {
  if (!schedule) return false;
  return parseHHMM(schedule.endTime) <= parseHHMM(schedule.startTime);
}

export function resolveWorkDateForShiftMoment(schedule: WorkSchedule | null, now: Date = new Date()): string {
  const today = vnDateString(now);
  if (!schedule || !isOvernightShift(schedule)) return today;

  const nowMinute = vnMinuteOfDay(now);
  const shiftEndWithGrace = parseHHMM(schedule.endTime) + schedule.earlyLeaveGraceMinutes;
  if (nowMinute <= shiftEndWithGrace) {
    return shiftWorkDate(today, -1);
  }
  return today;
}

function withEarlyLeaveWarning(
  status: AttendanceStatus,
  schedule: WorkSchedule | null,
  checkInAt: Date,
  checkOutAt: Date,
  warnings: string[],
): AttendanceStatus {
  if (!schedule) return status;

  const endMin = parseHHMM(schedule.endTime);
  const graceEnd = endMin - schedule.earlyLeaveGraceMinutes;
  const overnight = isOvernightShift(schedule);
  const checkOutMinute = vnMinuteOfDay(checkOutAt);
  const sameDay = vnDateString(checkInAt) === vnDateString(checkOutAt);

  let isEarly: boolean;

  if (overnight) {
    // Overnight shift (e.g. 22:00-06:00): checkout in the morning portion = early if before grace
    // Checkout on the same calendar day as check-in (before midnight) = very early
    if (sameDay) {
      isEarly = true;
    } else {
      isEarly = checkOutMinute < graceEnd;
    }
  } else {
    // Normal shift (e.g. 11:00-21:00): if checkout is the next day, they worked past midnight → NOT early
    if (!sameDay) {
      isEarly = false;
    } else {
      isEarly = checkOutMinute < graceEnd;
    }
  }

  if (isEarly) {
    warnings.push("EARLY_LEAVE");
    if (status === AttendanceStatus.PRESENT) return AttendanceStatus.EARLY_LEAVE;
  }
  return status;
}

export function getScheduleReferenceForAttendance(attendanceDay: Pick<AttendanceDay, "workDate" | "checkInAt">): Date {
  if (attendanceDay.checkInAt) return attendanceDay.checkInAt;
  const noonUtc = parseWorkDateToUtc(attendanceDay.workDate);
  noonUtc.setUTCHours(12, 0, 0, 0);
  return noonUtc;
}

export async function recalculateAttendanceDay(
  tx: Prisma.TransactionClient,
  attendanceDay: AttendanceDay,
  schedule: WorkSchedule | null,
): Promise<AttendanceDay> {
  if (attendanceDay.isOffDay) {
    return tx.attendanceDay.update({
      where: { id: attendanceDay.id },
      data: {
        status: AttendanceStatus.OFF,
        workedMinutes: 0,
        warningFlagsJson: "[]",
      },
    });
  }

  const breaks = await tx.breakSession.findMany({
    where: { attendanceDayId: attendanceDay.id, endAt: { not: null } },
    orderBy: { startAt: "asc" },
  });

  const warnings = calculateWarnings(breaks, getBreakPolicy(schedule));

  let workedMinutes: number | null = null;
  let status = attendanceDay.status;

  if (!attendanceDay.checkInAt) {
    status = AttendanceStatus.ABSENT;
  } else if (!attendanceDay.checkOutAt) {
    status = AttendanceStatus.INCOMPLETE;
  } else {
    const totalBreak = breaks.reduce((acc, item) => acc + (item.durationMinutesComputed ?? 0), 0);
    workedMinutes = Math.max(0, minutesBetween(attendanceDay.checkInAt, attendanceDay.checkOutAt) - totalBreak);
    const checkInStatus = computeCheckInStatus(schedule, attendanceDay.checkInAt);
    if (checkInStatus === AttendanceStatus.LATE) warnings.push("LATE");
    status = withEarlyLeaveWarning(checkInStatus, schedule, attendanceDay.checkInAt, attendanceDay.checkOutAt, warnings);
  }

  return tx.attendanceDay.update({
    where: { id: attendanceDay.id },
    data: {
      warningFlagsJson: JSON.stringify(warnings),
      workedMinutes,
      status,
    },
  });
}

export async function getOrCreateAttendanceByWorkDate(tx: Prisma.TransactionClient, userId: string, workDate: string): Promise<AttendanceDay> {
  const existing = await tx.attendanceDay.findUnique({ where: { userId_workDate: { userId, workDate } } });
  if (existing) return existing;

  return tx.attendanceDay.create({
    data: {
      userId,
      workDate,
      status: AttendanceStatus.INCOMPLETE,
      warningFlagsJson: "[]",
    },
  });
}

export async function getOrCreateTodayAttendance(tx: Prisma.TransactionClient, userId: string): Promise<AttendanceDay> {
  return getOrCreateAttendanceByWorkDate(tx, userId, vnDateString());
}

export async function getPendingPreviousOpenAttendance(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date(),
): Promise<AttendanceDay | null> {
  const schedule = await getActiveShiftForUser(userId, now, tx);
  const resolvedWorkDate = resolveWorkDateForShiftMoment(schedule, now);

  const openAttendance = await tx.attendanceDay.findFirst({
    where: {
      userId,
      checkInAt: { not: null },
      checkOutAt: null,
    },
    orderBy: { workDate: "desc" },
  });

  if (!openAttendance) return null;
  if (openAttendance.workDate === resolvedWorkDate) return null;
  return openAttendance;
}

export async function getOrCreateCurrentShiftAttendance(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date(),
  { forCheckout = false }: { forCheckout?: boolean } = {},
): Promise<AttendanceDay> {
  const schedule = await getActiveShiftForUser(userId, now, tx);
  const resolvedWorkDate = resolveWorkDateForShiftMoment(schedule, now);

  // Find any open attendance (checked in but not checked out) for this user.
  // No date restriction — handles gaps like off-days between check-in and check-out.
  const openAttendance = await tx.attendanceDay.findFirst({
    where: {
      userId,
      checkInAt: { not: null },
      checkOutAt: null,
    },
    orderBy: { workDate: "desc" },
  });

  if (openAttendance) {
    // If the open attendance is from the current resolved work date, return it normally
    // (e.g. still within the same shift, or same-day re-check)
    if (openAttendance.workDate === resolvedWorkDate) return openAttendance;

    // For checkout, always return the open attendance so it can be closed
    // (night shift employees may check out after the resolved work date rolls over)
    if (forCheckout) return openAttendance;

    // Previous shift still open — block and notify
    throw new Error("PREVIOUS_SHIFT_OPEN");
  }

  return getOrCreateAttendanceByWorkDate(tx, userId, resolvedWorkDate);
}
