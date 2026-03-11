import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { TIME_REGEX } from "@/lib/constants";

const breakPolicySchema = z.object({
  wc: z.object({ maxCount: z.number().int().min(0), maxMinutesEach: z.number().int().min(0) }),
  smoke: z.object({ maxCount: z.number().int().min(0), maxMinutesEach: z.number().int().min(0) }),
  meal: z.object({ maxCount: z.number().int().min(0), maxMinutesEach: z.number().int().min(0) }),
});

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startTime: z.string().regex(TIME_REGEX, "Giờ không hợp lệ (HH:MM)").optional(),
  endTime: z.string().regex(TIME_REGEX, "Giờ không hợp lệ (HH:MM)").optional(),
  lateGraceMinutes: z.number().int().min(0).optional(),
  earlyLeaveGraceMinutes: z.number().int().min(0).optional(),
  breakPolicyJson: breakPolicySchema.optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const { id } = await params;
  const payload = patchSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return fail("Ca làm việc không tồn tại", 404);

  const data: Record<string, unknown> = {};
  if (payload.data.name !== undefined) data.name = payload.data.name;
  if (payload.data.startTime !== undefined) data.startTime = payload.data.startTime;
  if (payload.data.endTime !== undefined) data.endTime = payload.data.endTime;
  if (payload.data.lateGraceMinutes !== undefined) data.lateGraceMinutes = payload.data.lateGraceMinutes;
  if (payload.data.earlyLeaveGraceMinutes !== undefined) data.earlyLeaveGraceMinutes = payload.data.earlyLeaveGraceMinutes;
  if (payload.data.breakPolicyJson !== undefined) data.breakPolicyJson = JSON.stringify(payload.data.breakPolicyJson);
  if (payload.data.isActive !== undefined) data.isActive = payload.data.isActive;

  const updated = await prisma.shift.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const { id } = await params;

  const existing = await prisma.shift.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!existing) return fail("Ca làm việc không tồn tại", 404);

  if (existing._count.assignments > 0) {
    // Soft-delete: deactivate instead of hard delete when assignments exist
    const updated = await prisma.shift.update({ where: { id }, data: { isActive: false } });
    return ok({ ...updated, softDeleted: true });
  }

  await prisma.shift.delete({ where: { id } });
  return ok({ deleted: id });
}
