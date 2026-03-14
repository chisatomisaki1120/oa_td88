import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { parseWarnings } from "@/lib/attendance";
import { parseHHMM } from "@/lib/time";

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return fail("month phải có dạng YYYY-MM", 400);

  const rows = await prisma.attendanceDay.findMany({
    where: { workDate: { gte: `${month}-01`, lte: `${month}-31` } },
    include: {
      user: {
        select: {
          id: true, username: true, fullName: true, department: true,
          allowedOffDaysPerMonth: true, workStartTime: true, workEndTime: true,
        },
      },
    },
    orderBy: [{ userId: "asc" }, { workDate: "asc" }],
  });

  type Summary = {
    userId: string;
    fullName: string;
    username: string;
    department: string;
    presentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    absentDays: number;
    offDaysPaid: number;
    offDaysDeducted: number;
    totalWorkedMinutes: number;
    overtimeMinutes: number;
    warningDays: number;
    allowedOff: number;
    remainingOff: number;
    _scheduledMin: number;
  };

  const byUser = new Map<string, Summary>();

  for (const row of rows) {
    const u = row.user;
    if (!byUser.has(u.id)) {
      const startMin = u.workStartTime ? parseHHMM(u.workStartTime) : 480;
      const endMin = u.workEndTime ? parseHHMM(u.workEndTime) : 1020;
      let scheduled = endMin - startMin;
      if (scheduled <= 0) scheduled += 1440;
      byUser.set(u.id, {
        userId: u.id,
        fullName: u.fullName,
        username: u.username,
        department: u.department ?? "",
        presentDays: 0, lateDays: 0, earlyLeaveDays: 0, absentDays: 0,
        offDaysPaid: 0, offDaysDeducted: 0,
        totalWorkedMinutes: 0, overtimeMinutes: 0, warningDays: 0,
        allowedOff: u.allowedOffDaysPerMonth,
        remainingOff: u.allowedOffDaysPerMonth,
        _scheduledMin: scheduled,
      });
    }

    const s = byUser.get(u.id)!;
    if (row.status === "PRESENT") s.presentDays++;
    else if (row.status === "LATE") { s.presentDays++; s.lateDays++; }
    else if (row.status === "EARLY_LEAVE") { s.presentDays++; s.earlyLeaveDays++; }
    else if (row.status === "ABSENT") s.absentDays++;

    if (row.isOffDay) {
      if (row.isDeducted) s.offDaysDeducted++;
      else s.offDaysPaid++;
    }

    const worked = row.workedMinutes ?? 0;
    s.totalWorkedMinutes += worked;
    if (worked > s._scheduledMin && !row.isOffDay) s.overtimeMinutes += worked - s._scheduledMin;

    if (parseWarnings(row.warningFlagsJson).length > 0) s.warningDays++;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const summaries = [...byUser.values()].map(({ _scheduledMin, ...s }) => ({
    ...s,
    remainingOff: Math.max(0, s.allowedOff - s.offDaysPaid),
  }));

  return ok(summaries);
}
