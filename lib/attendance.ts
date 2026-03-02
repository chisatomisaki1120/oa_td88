import { AttendanceDay, AttendanceStatus, BreakSession, BreakType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { minutesBetween, parseHHMM, vnDateString, vnMinuteOfDay } from "@/lib/time";

export type BreakPolicy = {
  wcSmoke: { maxCount: number; maxMinutesEach: number };
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
  wcSmoke: { maxCount: 3, maxMinutesEach: 10 },
  meal: { maxCount: 2, maxMinutesEach: 40 },
};

export async function getActiveShiftForUser(userId: string, atDate: Date = new Date()): Promise<WorkSchedule | null> {
  const user = await prisma.user.findUnique({
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

  const assignments = await prisma.employeeShiftAssignment.findMany({
    where: { userId },
    include: { shift: true },
    orderBy: { effectiveFrom: "desc" },
  });

  const assigned = assignments.find((a) => {
    const starts = a.effectiveFrom <= atDate;
    const ends = !a.effectiveTo || a.effectiveTo >= atDate;
    return starts && ends && a.shift.isActive;
  })?.shift;

  if (!assigned) return null;

  return {
    startTime: assigned.startTime,
    endTime: assigned.endTime,
    lateGraceMinutes: assigned.lateGraceMinutes,
    earlyLeaveGraceMinutes: assigned.earlyLeaveGraceMinutes,
    breakPolicyJson: assigned.breakPolicyJson,
  };
}

export async function assertMonthUnlocked(workDate: string): Promise<boolean> {
  const closure = await prisma.monthlyClosure.findUnique({ where: { month: workDate.slice(0, 7) } });
  return !closure || Boolean(closure.reopenedAt);
}

function getBreakPolicy(schedule: WorkSchedule | null): BreakPolicy {
  if (!schedule) return DEFAULT_BREAK_POLICY;
  try {
    return JSON.parse(schedule.breakPolicyJson) as BreakPolicy;
  } catch {
    return DEFAULT_BREAK_POLICY;
  }
}

function calculateWarnings(breaks: BreakSession[], policy: BreakPolicy): string[] {
  const warnings: string[] = [];
  const wcSmoke = breaks.filter((b) => b.breakType === BreakType.WC_SMOKE);
  const meals = breaks.filter((b) => b.breakType === BreakType.MEAL);

  if (wcSmoke.length > policy.wcSmoke.maxCount) warnings.push("WC_SMOKE_COUNT_EXCEEDED");
  if (meals.length > policy.meal.maxCount) warnings.push("MEAL_COUNT_EXCEEDED");

  if (wcSmoke.some((b) => (b.durationMinutesComputed ?? 0) > policy.wcSmoke.maxMinutesEach)) {
    warnings.push("WC_SMOKE_DURATION_EXCEEDED");
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

function withEarlyLeaveWarning(
  status: AttendanceStatus,
  schedule: WorkSchedule | null,
  checkOutAt: Date,
  warnings: string[],
): AttendanceStatus {
  if (!schedule) return status;
  if (vnMinuteOfDay(checkOutAt) < parseHHMM(schedule.endTime) - schedule.earlyLeaveGraceMinutes) {
    warnings.push("EARLY_LEAVE");
    if (status === AttendanceStatus.PRESENT) return AttendanceStatus.EARLY_LEAVE;
  }
  return status;
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
    status = withEarlyLeaveWarning(computeCheckInStatus(schedule, attendanceDay.checkInAt), schedule, attendanceDay.checkOutAt, warnings);
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

export async function getOrCreateTodayAttendance(tx: Prisma.TransactionClient, userId: string): Promise<AttendanceDay> {
  const workDate = vnDateString();
  const existing = await tx.attendanceDay.findUnique({ where: { userId_workDate: { userId, workDate } } });
  if (existing) return existing;

  return tx.attendanceDay.create({
    data: {
      userId,
      workDate,
      status: AttendanceStatus.INCOMPLETE,
      warningFlagsJson: "[]",
      lockedMonth: false,
    },
  });
}
