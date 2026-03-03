import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { vnDateString } from "@/lib/time";

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
    where: actor.role === Role.SUPER_ADMIN ? undefined : { role: { not: Role.SUPER_ADMIN } },
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

  const visibleUserIds = users.map((u) => u.id);
  const todayVn = vnDateString();
  let conflictEvents: Array<{
    userId: string;
    conflictWithUserId: string;
    conflictType: "IP" | "DEVICE";
    occurredAt: Date;
    conflictWithUser: { id: string; username: string; fullName: string };
  }> = [];
  try {
    conflictEvents = await prisma.loginConflictEvent.findMany({
      where: {
        userId: { in: visibleUserIds },
        conflictWithUserId: { in: visibleUserIds },
        OR: [{ conflictType: "DEVICE" }, { conflictType: "IP", occurredDate: todayVn }],
      },
      select: {
        userId: true,
        conflictWithUserId: true,
        conflictType: true,
        occurredAt: true,
        conflictWithUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
      orderBy: { occurredAt: "desc" },
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "P2021") throw error;
  }

  const byUser = new Map<
    string,
    Map<
      string,
      {
        accountId: string;
        username: string;
        fullName: string;
        ipConflictCountToday: number;
        deviceConflictCount: number;
        lastConflictAt: string;
      }
    >
  >();

  for (const event of conflictEvents) {
    const conflictUser = event.conflictWithUser;
    const userMap = byUser.get(event.userId) ?? new Map();
    const existing = userMap.get(conflictUser.id) ?? {
      accountId: conflictUser.id,
      username: conflictUser.username,
      fullName: conflictUser.fullName,
      ipConflictCountToday: 0,
      deviceConflictCount: 0,
      lastConflictAt: event.occurredAt.toISOString(),
    };

    if (event.conflictType === "IP") existing.ipConflictCountToday += 1;
    if (event.conflictType === "DEVICE") existing.deviceConflictCount += 1;
    if (new Date(existing.lastConflictAt) < event.occurredAt) {
      existing.lastConflictAt = event.occurredAt.toISOString();
    }

    userMap.set(conflictUser.id, existing);
    byUser.set(event.userId, userMap);
  }

  const enrichedUsers = users.map((user) => {
    const conflictMap = byUser.get(user.id);
    const sharedLoginConflicts = conflictMap ? [...conflictMap.values()].sort((a, b) => (a.lastConflictAt < b.lastConflictAt ? 1 : -1)) : [];
    const sharedIpConflictAccounts = sharedLoginConflicts.filter((item) => item.ipConflictCountToday > 0).length;
    const sharedDeviceConflictAccounts = sharedLoginConflicts.filter((item) => item.deviceConflictCount > 0).length;
    const hasSharedIpRisk = sharedIpConflictAccounts > 0;
    const hasSharedDeviceRisk = sharedDeviceConflictAccounts > 0;
    return {
      ...user,
      hasSharedLoginRisk: hasSharedIpRisk || hasSharedDeviceRisk,
      hasSharedIpRisk,
      hasSharedDeviceRisk,
      sharedIpConflictAccounts,
      sharedDeviceConflictAccounts,
      sharedLoginConflicts,
    };
  });

  return ok(enrichedUsers);
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

  if (!user) return fail("Không tạo được tài khoản hoặc dữ liệu không hợp lệ", 409);

  return ok(user, { status: 201 });
}
