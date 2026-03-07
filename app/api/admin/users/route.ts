import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { TIME_REGEX, PASSWORD_MIN_LENGTH } from "@/lib/constants";

const createSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  fullName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal("")),
  department: z.string().max(50).optional(),
  role: z.nativeEnum(Role),
  isActive: z.boolean().default(true),
  workStartTime: z.string().regex(TIME_REGEX, "Giờ không hợp lệ (HH:MM)").optional().or(z.literal("")),
  workEndTime: z.string().regex(TIME_REGEX, "Giờ không hợp lệ (HH:MM)").optional().or(z.literal("")),
  lateGraceMinutes: z.number().int().min(0).max(180).default(5),
  earlyLeaveGraceMinutes: z.number().int().min(0).max(180).default(5),
  workMode: z.nativeEnum(WorkMode).default(WorkMode.OFFLINE),
  allowedOffDaysPerMonth: z.number().int().min(0).max(31).default(2),
});

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(actor.role === Role.SUPER_ADMIN ? {} : { role: { not: Role.SUPER_ADMIN } }),
    },
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
    orderBy: { createdAt: "desc" },
  });

  return ok(users);
}

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = createSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  if (actor.role === Role.ADMIN && payload.data.role === Role.SUPER_ADMIN) {
    return fail("Quản trị viên không được tạo tài khoản SuperAdmin", 403);
  }

  if (actor.role !== Role.SUPER_ADMIN && payload.data.role === Role.SUPER_ADMIN) {
    return fail("Admin không được tạo SuperAdmin", 403);
  }

  const existing = await prisma.user.findUnique({ where: { username: payload.data.username } });

  if (existing && !existing.deletedAt) {
    return fail("Tên đăng nhập đã tồn tại", 409);
  }

  if (existing && existing.deletedAt) {
    // Reactivate soft-deleted user with new data
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await hashPassword(payload.data.password),
        fullName: payload.data.fullName,
        email: payload.data.email || null,
        department: payload.data.department || null,
        role: payload.data.role,
        isActive: payload.data.isActive,
        workStartTime: payload.data.workStartTime || null,
        workEndTime: payload.data.workEndTime || null,
        lateGraceMinutes: payload.data.lateGraceMinutes,
        earlyLeaveGraceMinutes: payload.data.earlyLeaveGraceMinutes,
        workMode: payload.data.workMode,
        allowedOffDaysPerMonth: payload.data.allowedOffDaysPerMonth,
        deletedAt: null,
      },
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
    return ok(user, { status: 201 });
  }

  const user = await prisma.user
    .create({
      data: {
        username: payload.data.username,
        passwordHash: await hashPassword(payload.data.password),
        fullName: payload.data.fullName,
        email: payload.data.email || null,
        department: payload.data.department || null,
        role: payload.data.role,
        isActive: payload.data.isActive,
        workStartTime: payload.data.workStartTime || null,
        workEndTime: payload.data.workEndTime || null,
        lateGraceMinutes: payload.data.lateGraceMinutes,
        earlyLeaveGraceMinutes: payload.data.earlyLeaveGraceMinutes,
        workMode: payload.data.workMode,
        allowedOffDaysPerMonth: payload.data.allowedOffDaysPerMonth,
      },
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
    })
    .catch(() => null);

  if (!user) return fail("Tên đăng nhập đã tồn tại hoặc dữ liệu không hợp lệ", 409);

  return ok(user, { status: 201 });
}
