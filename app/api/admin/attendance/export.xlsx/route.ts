import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { parseWarnings } from "@/lib/attendance";

type EmployeeSummary = {
  employeeName: string;
  department: string;
  allowedOffDaysPerMonth: number;
  totalDays: number;
  missedPunchDays: number;
  lateCount: number;
  breakExceededCount: number;
  offDayCount: number;
};

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const userId = searchParams.get("userId");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return fail("month phải có dạng YYYY-MM", 400);
  }

  const rows = await prisma.attendanceDay.findMany({
    where: {
      workDate: {
        gte: `${month}-01`,
        lte: `${month}-31`,
      },
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, username: true, fullName: true, department: true, allowedOffDaysPerMonth: true } },
    },
    orderBy: [{ userId: "asc" }, { workDate: "asc" }],
  });

  const summaryByUser = new Map<string, EmployeeSummary>();

  for (const row of rows) {
    const key = row.user.id;
    const current =
      summaryByUser.get(key) ??
      ({
        employeeName: row.user.username,
        department: row.user.department ?? "",
        allowedOffDaysPerMonth: row.user.allowedOffDaysPerMonth,
        totalDays: 0,
        missedPunchDays: 0,
        lateCount: 0,
        breakExceededCount: 0,
        offDayCount: 0,
      } satisfies EmployeeSummary);

    current.totalDays += 1;
    if (row.status === "INCOMPLETE") {
      current.missedPunchDays += 1;
    }

    const warnings = parseWarnings(row.warningFlagsJson);
    const hasBreakExceeded = warnings.some((w) => w.endsWith("_EXCEEDED"));

    if (row.status === "LATE" || warnings.includes("LATE")) {
      current.lateCount += 1;
    }
    if (hasBreakExceeded) {
      current.breakExceededCount += 1;
    }
    if (row.isOffDay) {
      current.offDayCount += 1;
    }

    summaryByUser.set(key, current);
  }

  const summaries = [...summaryByUser.values()];
  const sheetRows = [
    [
      "Tháng",
      "Tên Nhân Viên",
      "Chức vụ",
      "Số ngày công",
      "Số ngày quên chấm công",
      "Số lần đi muộn",
      "Số lần quá giờ nghỉ",
      "Số ngày phép",
      "Số ngày nghỉ",
    ],
    ...summaries.map((s) => [
      month,
      s.employeeName,
      s.department,
      s.totalDays,
      s.missedPunchDays,
      s.lateCount,
      s.breakExceededCount,
      s.allowedOffDaysPerMonth,
      s.offDayCount,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "TongHopChamCong");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="tong-hop-cham-cong-theo-nhan-vien-${month}.xlsx"`,
    },
  });
}
