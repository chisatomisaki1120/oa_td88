import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { vnMonthString, parseHHMM } from "@/lib/time";

// GET /api/admin/overtime?month=YYYY-MM
export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? vnMonthString();
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("month phải có dạng YYYY-MM", 400);

  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true, fullName: true, username: true, department: true,
      allowedOffDaysPerMonth: true, workStartTime: true, workEndTime: true,
    },
  });

  const attendance = await prisma.attendanceDay.findMany({
    where: { workDate: { gte: `${month}-01`, lte: `${month}-31` } },
    select: { userId: true, workedMinutes: true, isOffDay: true, isDeducted: true, status: true },
  });

  const byUser = new Map<string, { workedDays: number; totalMinutes: number; offDaysPaid: number; offDaysDeducted: number; overtimeMinutes: number }>();
  const userMap = new Map(users.map((u) => [u.id, u]));

  for (const u of users) {
    byUser.set(u.id, { workedDays: 0, totalMinutes: 0, offDaysPaid: 0, offDaysDeducted: 0, overtimeMinutes: 0 });
  }

  for (const a of attendance) {
    const s = byUser.get(a.userId);
    if (!s) continue;

    if (a.isOffDay) {
      if (a.isDeducted) s.offDaysDeducted++;
      else s.offDaysPaid++;
    }

    const worked = a.workedMinutes ?? 0;
    if (worked > 0 && !a.isOffDay) {
      s.workedDays++;
      s.totalMinutes += worked;
      const u = userMap.get(a.userId);
      if (u) {
        const startMin = u.workStartTime ? parseHHMM(u.workStartTime) : 480;
        const endMin = u.workEndTime ? parseHHMM(u.workEndTime) : 1020;
        let scheduled = endMin - startMin;
        if (scheduled <= 0) scheduled += 1440;
        if (worked > scheduled) s.overtimeMinutes += worked - scheduled;
      }
    }
  }

  const results = users
    .map((u) => {
      const s = byUser.get(u.id);
      if (!s) return null;
      const excessOffDays = Math.max(0, (s.offDaysPaid + s.offDaysDeducted) - u.allowedOffDaysPerMonth);
      return {
        userId: u.id,
        fullName: u.fullName,
        username: u.username,
        department: u.department ?? "",
        workedDays: s.workedDays,
        totalWorkedHours: Math.round(s.totalMinutes / 60 * 10) / 10,
        overtimeHours: Math.round(s.overtimeMinutes / 60 * 10) / 10,
        offDaysPaid: s.offDaysPaid,
        offDaysDeducted: s.offDaysDeducted,
        allowedOff: u.allowedOffDaysPerMonth,
        excessOffDays,
        hasOvertime: s.overtimeMinutes > 0,
        hasExcessOff: excessOffDays > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.overtimeHours - a!.overtimeHours));

  return ok(results);
}
