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

  const effectiveFrom = new Date(payload.data.effectiveFrom);
  const effectiveTo = payload.data.effectiveTo ? new Date(payload.data.effectiveTo) : null;

  const assignment = await prisma.$transaction(async (tx) => {
    const [userExists, shiftExists] = await Promise.all([
      tx.user.findUnique({ where: { id: payload.data.userId }, select: { id: true } }),
      tx.shift.findUnique({ where: { id: payload.data.shiftId }, select: { id: true } }),
    ]);
    if (!userExists) throw new Error("USER_NOT_FOUND");
    if (!shiftExists) throw new Error("SHIFT_NOT_FOUND");

    const overlapping = await tx.employeeShiftAssignment.findFirst({
      where: {
        userId: payload.data.userId,
        effectiveFrom: { lte: effectiveTo ?? new Date("9999-12-31T23:59:59.999Z") },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      select: { id: true },
    });
    if (overlapping) throw new Error("OVERLAPPING_ASSIGNMENT");

    return tx.employeeShiftAssignment.create({
      data: {
        userId: payload.data.userId,
        shiftId: payload.data.shiftId,
        effectiveFrom,
        effectiveTo,
      },
    });
  }).catch((e) => {
    if (e instanceof Error) return e.message;
    throw e;
  });

  if (assignment === "USER_NOT_FOUND") return fail("Nhân viên không tồn tại", 404);
  if (assignment === "SHIFT_NOT_FOUND") return fail("Ca làm việc không tồn tại", 404);
  if (assignment === "OVERLAPPING_ASSIGNMENT") return fail("Khoảng thời gian ca làm bị chồng chéo với assignment hiện có", 409);

  return ok(assignment, { status: 201 });
}
