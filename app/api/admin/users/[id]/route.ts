import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  department: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  lateGraceMinutes: z.number().int().min(0).max(180).optional(),
  earlyLeaveGraceMinutes: z.number().int().min(0).max(180).optional(),
  workMode: z.nativeEnum(WorkMode).optional(),
  allowedOffDaysPerMonth: z.number().int().min(0).max(31).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const { id } = await params;
  const payload = updateSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  if (actor.role !== Role.SUPER_ADMIN && payload.data.role === Role.SUPER_ADMIN) {
    return fail("Admin không được cấp quyền SuperAdmin", 403);
  }

  const data: Record<string, unknown> = {
    ...payload.data,
  };
  if (payload.data.email === "") data.email = null;
  if (payload.data.workStartTime === "") data.workStartTime = null;
  if (payload.data.workEndTime === "") data.workEndTime = null;

  if (payload.data.password) {
    data.passwordHash = await hashPassword(payload.data.password);
    delete data.password;
  }

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return fail("Không tìm thấy user", 404);
  if (actor.role !== Role.SUPER_ADMIN && before.role === Role.SUPER_ADMIN) {
    return fail("Admin không được sửa tài khoản SuperAdmin", 403);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      department: true,
      role: true,
      isActive: true,
      workStartTime: true,
      workEndTime: true,
      lateGraceMinutes: true,
      earlyLeaveGraceMinutes: true,
      workMode: true,
      allowedOffDaysPerMonth: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "UPDATE_USER",
      entityType: "User",
      entityId: id,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
    },
  });

  return ok(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const { id } = await params;
  if (id === actor.id) return fail("Không thể tự xóa tài khoản đang đăng nhập", 409);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return fail("Không tìm thấy user", 404);
  if (actor.role !== Role.SUPER_ADMIN && existing.role === Role.SUPER_ADMIN) {
    return fail("Admin không được xóa SuperAdmin", 403);
  }

  await prisma.user.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "DELETE_USER",
      entityType: "User",
      entityId: id,
      beforeJson: JSON.stringify(existing),
    },
  });

  return ok({ deleted: true });
}
