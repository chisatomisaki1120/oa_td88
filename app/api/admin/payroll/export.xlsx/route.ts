import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { parseHHMM, fmtMinutesToHours } from "@/lib/time";
import { parseWarnings } from "@/lib/attendance";

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
    fullName: string;
    username: string;
    department: string;
    allowedOff: number;
    presentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    absentDays: number;
    offDaysPaid: number;
    offDaysDeducted: number;
    totalWorkedMinutes: number;
    overtimeMinutes: number;
    warningDays: number;
    scheduledMinutesPerDay: number;
  };

  const byUser = new Map<string, Summary>();

  for (const row of rows) {
    const u = row.user;
    if (!byUser.has(u.id)) {
      const startMin = u.workStartTime ? parseHHMM(u.workStartTime) : 480;
      const endMin = u.workEndTime ? parseHHMM(u.workEndTime) : 1020;
      let scheduled = endMin - startMin;
      if (scheduled <= 0) scheduled += 1440; // overnight
      byUser.set(u.id, {
        fullName: u.fullName,
        username: u.username,
        department: u.department ?? "",
        allowedOff: u.allowedOffDaysPerMonth,
        presentDays: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        absentDays: 0,
        offDaysPaid: 0,
        offDaysDeducted: 0,
        totalWorkedMinutes: 0,
        overtimeMinutes: 0,
        warningDays: 0,
        scheduledMinutesPerDay: scheduled,
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
    if (worked > s.scheduledMinutesPerDay && !row.isOffDay) {
      s.overtimeMinutes += worked - s.scheduledMinutesPerDay;
    }

    const warnings = parseWarnings(row.warningFlagsJson);
    if (warnings.length > 0) s.warningDays++;
  }

  const summaries = [...byUser.values()];

  const sheetRows = [
    ["BÁO CÁO LƯƠNG THÁNG " + month],
    [],
    [
      "Nhân viên", "Username", "Chức vụ",
      "Ngày công", "Đi muộn", "Về sớm", "Vắng",
      "Nghỉ có phép", "Nghỉ trừ lương",
      "Tổng giờ làm", "Giờ OT",
      "Ngày cảnh báo", "Phép còn lại",
    ],
    ...summaries.map((s) => [
      s.fullName, s.username, s.department,
      s.presentDays, s.lateDays, s.earlyLeaveDays, s.absentDays,
      s.offDaysPaid, s.offDaysDeducted,
      fmtMinutesToHours(s.totalWorkedMinutes), fmtMinutesToHours(s.overtimeMinutes),
      s.warningDays, Math.max(0, s.allowedOff - s.offDaysPaid),
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!cols"] = [
    { wch: 24 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 14 },
  ];
  // Bold title
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "BaoCaoLuong");

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-luong-${month}.xlsx"`,
    },
  });
}

