import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  department: z.string().optional(),
  role: z.nativeEnum(Role),
  isActive: z.boolean().default(true),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  lateGraceMinutes: z.number().int().min(0).max(180).default(5),
  earlyLeaveGraceMinutes: z.number().int().min(0).max(180).default(5),
  workMode: z.nativeEnum(WorkMode).default(WorkMode.OFFLINE),
  allowedOffDaysPerMonth: z.number().int().min(0).max(31).default(2),
});

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      department: true,
      role: true,
      isActive: true,
      hasSharedLoginRisk: true,
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

  if (actor.role !== Role.SUPER_ADMIN && payload.data.role === Role.SUPER_ADMIN) {
    return fail("Admin không được tạo SuperAdmin", 403);
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
        hasSharedLoginRisk: true,
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

  if (!user) return fail("Username đã tồn tại hoặc dữ liệu không hợp lệ", 409);

  return ok(user, { status: 201 });
}
