import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(actor.role === Role.SUPER_ADMIN ? {} : { role: { not: Role.SUPER_ADMIN } }),
    },
    select: {
      username: true,
      fullName: true,
      email: true,
      phone: true,
      department: true,
      role: true,
      isActive: true,
      workStartTime: true,
      workEndTime: true,
      lateGraceMinutes: true,
      earlyLeaveGraceMinutes: true,
      workMode: true,
      allowedOffDaysPerMonth: true,
      shiftAssignments: {
        where: { effectiveTo: null },
        select: { shift: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const roleLabel = (r: string) => {
    switch (r) {
      case "SUPER_ADMIN": return "Siêu quản trị";
      case "ADMIN": return "Quản trị viên";
      case "EMPLOYEE": return "Nhân viên";
      default: return r;
    }
  };

  const sheetRows = [
    [
      "Tên đăng nhập",
      "Họ và tên",
      "Email",
      "Điện thoại",
      "Chức vụ",
      "Vai trò",
      "Ca làm việc",
      "Trạng thái",
      "Giờ vào",
      "Giờ ra",
      "Phút trễ cho phép",
      "Phút về sớm cho phép",
      "Hình thức",
      "Nghỉ/tháng",
    ],
    ...users.map((u) => [
      u.username,
      u.fullName,
      u.email ?? "",
      u.phone ?? "",
      u.department ?? "",
      roleLabel(u.role),
      u.shiftAssignments[0]?.shift.name ?? "",
      u.isActive ? "Hoạt động" : "Ngừng",
      u.workStartTime ?? "",
      u.workEndTime ?? "",
      u.lateGraceMinutes,
      u.earlyLeaveGraceMinutes,
      u.workMode === "ONLINE" ? "Online" : "Offline",
      u.allowedOffDaysPerMonth,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!cols"] = [
    { wch: 18 }, // username
    { wch: 24 }, // fullName
    { wch: 24 }, // email
    { wch: 14 }, // phone
    { wch: 18 }, // department
    { wch: 16 }, // role
    { wch: 20 }, // shift
    { wch: 12 }, // status
    { wch: 10 }, // workStartTime
    { wch: 10 }, // workEndTime
    { wch: 16 }, // lateGrace
    { wch: 18 }, // earlyLeaveGrace
    { wch: 10 }, // workMode
    { wch: 12 }, // offDays
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "NhanVien");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="danh-sach-nhan-vien-${today}.xlsx"`,
    },
  });
}
