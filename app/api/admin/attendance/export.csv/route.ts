import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

type EmployeeSummary = {
  username: string;
  fullName: string;
  department: string;
  allowedOffDaysPerMonth: number;
  totalDays: number;
  totalWorkedMinutes: number;
  lateCount: number;
  breakExceededCount: number;
  offDayCount: number;
  deductedOffDayCount: number;
};

function parseWarnings(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

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
        username: row.user.username,
        fullName: row.user.fullName,
        department: row.user.department ?? "",
        allowedOffDaysPerMonth: row.user.allowedOffDaysPerMonth,
        totalDays: 0,
        totalWorkedMinutes: 0,
        lateCount: 0,
        breakExceededCount: 0,
        offDayCount: 0,
        deductedOffDayCount: 0,
      } satisfies EmployeeSummary);

    current.totalDays += 1;
    current.totalWorkedMinutes += row.workedMinutes ?? 0;

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
      if (row.isDeducted) current.deductedOffDayCount += 1;
    }

    summaryByUser.set(key, current);
  }

  const summaries = [...summaryByUser.values()];

  const header = [
    "month",
    "username",
    "fullName",
    "department",
    "totalDays",
    "totalWorkedMinutes",
    "lateCount",
    "breakExceededCount",
    "allowedOffDaysPerMonth",
    "offDayCount",
    "deductedOffDayCount",
  ];

  const csv = [
    header.join(","),
    ...summaries.map((s) =>
      [
        month,
        s.username,
        s.fullName,
        s.department,
        s.totalDays,
        s.totalWorkedMinutes,
        s.lateCount,
        s.breakExceededCount,
        s.allowedOffDaysPerMonth,
        s.offDayCount,
        s.deductedOffDayCount,
      ]
        .map((v) => `"${String(v).replaceAll("\"", "\"\"")}"`)
        .join(","),
    ),
  ].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-summary-by-employee-${month}.csv"`,
    },
  });
}
