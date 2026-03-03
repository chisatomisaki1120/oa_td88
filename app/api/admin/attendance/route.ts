import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const department = searchParams.get("department");
  const userId = searchParams.get("userId");
  const limitRaw = Number(searchParams.get("limit") ?? "200");
  const take = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 200;

  const where: Record<string, unknown> = {};
  if (date) where.workDate = date;
  if (userId) where.userId = userId;

  const items = await prisma.attendanceDay.findMany({
    where: {
      ...where,
      user: department ? { department } : undefined,
    },
    select: {
      id: true,
      workDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workedMinutes: true,
      isOffDay: true,
      isDeducted: true,
      offReason: true,
      warningFlagsJson: true,
      user: {
        select: {
          id: true,
          fullName: true,
          username: true,
          department: true,
        },
      },
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take,
  });

  return ok(items);
}
