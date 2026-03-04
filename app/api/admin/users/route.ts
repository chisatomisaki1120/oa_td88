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

  if (visibleUserIds.length > 0) {
    let ipGrouped: Array<{
      userId: string;
      conflictWithUserId: string;
      _count: { _all: number };
      _max: { occurredAt: Date | null };
    }> = [];
    let deviceGrouped: Array<{
      userId: string;
      conflictWithUserId: string;
      _count: { _all: number };
      _max: { occurredAt: Date | null };
    }> = [];

    try {
      [ipGrouped, deviceGrouped] = await Promise.all([
        prisma.loginConflictEvent.groupBy({
          by: ["userId", "conflictWithUserId"],
          where: {
            userId: { in: visibleUserIds },
            conflictWithUserId: { in: visibleUserIds },
            conflictType: "IP",
            occurredDate: todayVn,
          },
          _count: { _all: true },
          _max: { occurredAt: true },
        }),
        prisma.loginConflictEvent.groupBy({
          by: ["userId", "conflictWithUserId"],
          where: {
            userId: { in: visibleUserIds },
            conflictWithUserId: { in: visibleUserIds },
            conflictType: "DEVICE",
          },
          _count: { _all: true },
          _max: { occurredAt: true },
        }),
      ]);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== "P2021") throw error;
    }

    const relatedIds = Array.from(new Set([...ipGrouped, ...deviceGrouped].map((row) => row.conflictWithUserId)));
    const relatedUsers =
      relatedIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: relatedIds } },
            select: { id: true, username: true, fullName: true },
          });
    const relatedUserMap = new Map(relatedUsers.map((u) => [u.id, u]));

    const mergeRow = (
      row: { userId: string; conflictWithUserId: string; _count: { _all: number }; _max: { occurredAt: Date | null } },
      type: "IP" | "DEVICE",
    ) => {
      const conflictUser = relatedUserMap.get(row.conflictWithUserId);
      if (!conflictUser) return;

      const userMap = byUser.get(row.userId) ?? new Map();
      const existing = userMap.get(conflictUser.id) ?? {
        accountId: conflictUser.id,
        username: conflictUser.username,
        fullName: conflictUser.fullName,
        ipConflictCountToday: 0,
        deviceConflictCount: 0,
        lastConflictAt: row._max.occurredAt?.toISOString() ?? new Date(0).toISOString(),
      };

      if (type === "IP") existing.ipConflictCountToday += row._count._all;
      if (type === "DEVICE") existing.deviceConflictCount += row._count._all;

      const lastAt = row._max.occurredAt?.toISOString();
      if (lastAt && new Date(existing.lastConflictAt) < new Date(lastAt)) {
        existing.lastConflictAt = lastAt;
      }

      userMap.set(conflictUser.id, existing);
      byUser.set(row.userId, userMap);
    };

    for (const row of ipGrouped) mergeRow(row, "IP");
    for (const row of deviceGrouped) mergeRow(row, "DEVICE");
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
