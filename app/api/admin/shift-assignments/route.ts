import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

const schema = z.object({
  userId: z.string().min(1),
  shiftId: z.string().min(1),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  if (payload.data.effectiveTo && new Date(payload.data.effectiveTo) <= new Date(payload.data.effectiveFrom)) {
    return fail("Ngày kết thúc phải sau ngày bắt đầu", 400);
  }

  const [userExists, shiftExists] = await Promise.all([
    prisma.user.findUnique({ where: { id: payload.data.userId }, select: { id: true } }),
    prisma.shift.findUnique({ where: { id: payload.data.shiftId }, select: { id: true } }),
  ]);
  if (!userExists) return fail("Nhân viên không tồn tại", 404);
  if (!shiftExists) return fail("Ca làm việc không tồn tại", 404);

  const assignment = await prisma.employeeShiftAssignment.create({
    data: {
      userId: payload.data.userId,
      shiftId: payload.data.shiftId,
      effectiveFrom: new Date(payload.data.effectiveFrom),
      effectiveTo: payload.data.effectiveTo ? new Date(payload.data.effectiveTo) : null,
    },
  });

  return ok(assignment, { status: 201 });
}
