import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { vnDateString, vnMonthString } from "@/lib/time";
import { parseWarnings } from "@/lib/attendance";

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const today = vnDateString();
  const month = vnMonthString();

  // Parallel queries for today's stats, monthly stats, and employee list
  const [totalEmployees, todayAttendance, monthAttendance, allEmployees] = await Promise.all([
    prisma.user.count({ where: { role: "EMPLOYEE", isActive: true, deletedAt: null } }),
    prisma.attendanceDay.findMany({
      where: { workDate: today },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    }),
    prisma.attendanceDay.findMany({
      where: { workDate: { gte: `${month}-01`, lte: `${month}-31` } },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    }),
    prisma.user.findMany({
      where: { role: "EMPLOYEE", isActive: true, deletedAt: null },
      select: { id: true, fullName: true, username: true },
    }),
  ]);

  // Classify today's attendance in a single pass
  type EmpRef = { fullName: string; username: string };
  const presentList: EmpRef[] = [];
  const lateList: EmpRef[] = [];
  const absentList: EmpRef[] = [];
  const offList: EmpRef[] = [];
  const incompleteList: EmpRef[] = [];
  const checkedInUserIds = new Set<string>();

  for (const a of todayAttendance) {
    const emp = { fullName: a.user.fullName, username: a.user.username };
    checkedInUserIds.add(a.userId);
    if (a.status === "PRESENT" || a.status === "LATE" || a.status === "EARLY_LEAVE") presentList.push(emp);
    if (a.status === "LATE") lateList.push(emp);
    if (a.status === "ABSENT") absentList.push(emp);
    if (a.status === "INCOMPLETE") incompleteList.push(emp);
    if (a.isOffDay) offList.push(emp);
  }

  const notCheckedInList = allEmployees
    .filter((u) => !checkedInUserIds.has(u.id))
    .map((u) => ({ fullName: u.fullName, username: u.username }));

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

  // Top late employees — share the array to avoid 3× spread+sort
  const empArr = [...empMap.values()];
  const topLate = empArr.filter((e) => e.late > 0).sort((a, b) => b.late - a.late).slice(0, 10);
  const topAbsent = empArr.filter((e) => e.absent > 0).sort((a, b) => b.absent - a.absent).slice(0, 10);
  const topWarnings = empArr.filter((e) => e.warnings > 0).sort((a, b) => b.warnings - a.warnings).slice(0, 10);

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
