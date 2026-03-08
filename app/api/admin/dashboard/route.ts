import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { vnDateString, vnMonthString } from "@/lib/time";

function parseWarnings(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const today = vnDateString();
  const month = vnMonthString();

  // Today's stats
  const totalEmployees = await prisma.user.count({ where: { role: "EMPLOYEE", isActive: true, deletedAt: null } });
  const todayAttendance = await prisma.attendanceDay.findMany({
    where: { workDate: today },
    include: { user: { select: { id: true, fullName: true, username: true } } },
  });

  const presentList = todayAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE" || a.status === "EARLY_LEAVE").map((a) => ({ fullName: a.user.fullName, username: a.user.username }));
  const lateList = todayAttendance.filter((a) => a.status === "LATE").map((a) => ({ fullName: a.user.fullName, username: a.user.username }));
  const absentList = todayAttendance.filter((a) => a.status === "ABSENT").map((a) => ({ fullName: a.user.fullName, username: a.user.username }));
  const offList = todayAttendance.filter((a) => a.isOffDay).map((a) => ({ fullName: a.user.fullName, username: a.user.username }));
  const incompleteList = todayAttendance.filter((a) => a.status === "INCOMPLETE").map((a) => ({ fullName: a.user.fullName, username: a.user.username }));

  const checkedInUserIds = new Set(todayAttendance.map((a) => a.userId));
  const notCheckedInUsers = await prisma.user.findMany({
    where: { role: "EMPLOYEE", isActive: true, deletedAt: null, id: { notIn: [...checkedInUserIds] } },
    select: { fullName: true, username: true },
  });
  const notCheckedInList = notCheckedInUsers.map((u) => ({ fullName: u.fullName, username: u.username }));

  // Monthly stats
  const monthAttendance = await prisma.attendanceDay.findMany({
    where: { workDate: { gte: `${month}-01`, lte: `${month}-31` } },
    include: { user: { select: { id: true, fullName: true, username: true } } },
  });

  // Per-employee monthly aggregates
  type EmpStats = { fullName: string; username: string; late: number; absent: number; warnings: number; offDays: number };
  const empMap = new Map<string, EmpStats>();

  for (const a of monthAttendance) {
    if (!empMap.has(a.userId)) {
      empMap.set(a.userId, { fullName: a.user.fullName, username: a.user.username, late: 0, absent: 0, warnings: 0, offDays: 0 });
    }
    const s = empMap.get(a.userId)!;
    if (a.status === "LATE") s.late++;
    if (a.status === "ABSENT") s.absent++;
    if (parseWarnings(a.warningFlagsJson).length > 0) s.warnings++;
    if (a.isOffDay) s.offDays++;
  }

  // Monthly daily breakdown (for chart)
  type EmpRef = { fullName: string; username: string };
  type DailyEntry = {
    present: number; late: number; absent: number; off: number;
    presentList: EmpRef[]; lateList: EmpRef[]; absentList: EmpRef[]; offList: EmpRef[]; incompleteList: EmpRef[];
  };
  const dailyMap = new Map<string, DailyEntry>();
  for (const a of monthAttendance) {
    if (!dailyMap.has(a.workDate)) dailyMap.set(a.workDate, { present: 0, late: 0, absent: 0, off: 0, presentList: [], lateList: [], absentList: [], offList: [], incompleteList: [] });
    const d = dailyMap.get(a.workDate)!;
    const emp: EmpRef = { fullName: a.user.fullName, username: a.user.username };
    if (a.status === "PRESENT" || a.status === "LATE" || a.status === "EARLY_LEAVE") {
      d.present++;
      d.presentList.push(emp);
    }
    if (a.status === "LATE") { d.late++; d.lateList.push(emp); }
    if (a.status === "ABSENT") { d.absent++; d.absentList.push(emp); }
    if (a.status === "INCOMPLETE") d.incompleteList.push(emp);
    if (a.isOffDay) { d.off++; d.offList.push(emp); }
  }

  const dailyChart = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date: date.slice(8), fullDate: date, ...data }));

  // Top late employees
  const topLate = [...empMap.values()].sort((a, b) => b.late - a.late).slice(0, 10).filter((e) => e.late > 0);
  const topAbsent = [...empMap.values()].sort((a, b) => b.absent - a.absent).slice(0, 10).filter((e) => e.absent > 0);
  const topWarnings = [...empMap.values()].sort((a, b) => b.warnings - a.warnings).slice(0, 10).filter((e) => e.warnings > 0);

  return ok({
    today: {
      date: today,
      totalEmployees,
      present: presentList.length, late: lateList.length, absent: absentList.length,
      off: offList.length, incomplete: incompleteList.length, notCheckedIn: notCheckedInList.length,
      presentList, lateList, absentList, offList, incompleteList, notCheckedInList,
    },
    month: { month, dailyChart },
    rankings: { topLate, topAbsent, topWarnings },
  });
}
