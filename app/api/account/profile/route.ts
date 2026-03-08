import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { sanitizeUserForAudit } from "@/lib/audit";
import { vnMonthString } from "@/lib/time";

const updateSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(20).optional().or(z.literal("")),
    address: z.string().max(200).optional().or(z.literal("")),
    department: z.string().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(6).optional(),
    workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
    workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
    lateGraceMinutes: z.number().int().min(0).max(180).optional(),
    earlyLeaveGraceMinutes: z.number().int().min(0).max(180).optional(),
    workMode: z.nativeEnum(WorkMode).optional(),
  })
  .refine((v) => !v.newPassword || Boolean(v.currentPassword), {
    message: "Cần nhập mật khẩu hiện tại để đổi mật khẩu",
    path: ["currentPassword"],
  });

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return fail("Unauthorized", 401);

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      address: true,
      department: true,
      role: true,
      workStartTime: true,
      workEndTime: true,
      lateGraceMinutes: true,
      earlyLeaveGraceMinutes: true,
      workMode: true,
      allowedOffDaysPerMonth: true,
    },
  });

  // Personal attendance stats for current month
  const month = vnMonthString();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const attendance = await prisma.attendanceDay.findMany({
    where: { userId: user.id, workDate: { gte: monthStart, lte: monthEnd } },
    select: { status: true, isOffDay: true, isDeducted: true, workedMinutes: true, warningFlagsJson: true },
  });

  const stats = {
    month,
    totalDays: attendance.length,
    presentDays: attendance.filter((a) => a.status === "PRESENT").length,
    lateDays: attendance.filter((a) => a.status === "LATE").length,
    earlyLeaveDays: attendance.filter((a) => a.status === "EARLY_LEAVE").length,
    absentDays: attendance.filter((a) => a.status === "ABSENT").length,
    offDays: attendance.filter((a) => a.isOffDay).length,
    deductedDays: attendance.filter((a) => a.isDeducted).length,
    totalWorkedMinutes: attendance.reduce((sum, a) => sum + (a.workedMinutes ?? 0), 0),
    warningCount: attendance.filter((a) => {
      try { const w = JSON.parse(a.warningFlagsJson); return Array.isArray(w) && w.length > 0; } catch { return false; }
    }).length,
    allowedOffDaysPerMonth: me?.allowedOffDaysPerMonth ?? 2,
  };

  return ok({ ...me, stats });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return fail("Unauthorized", 401);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = updateSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const current = await prisma.user.findUnique({ where: { id: user.id } });
  if (!current) return fail("Không tìm thấy tài khoản", 404);

  if (payload.data.newPassword) {
    const valid = await verifyPassword(payload.data.currentPassword ?? "", current.passwordHash);
    if (!valid) return fail("Mật khẩu hiện tại không đúng", 400);
  }

  const data: Record<string, unknown> = {};
  if (payload.data.fullName !== undefined) data.fullName = payload.data.fullName;
  if (payload.data.email !== undefined) data.email = payload.data.email || null;
  if (payload.data.phone !== undefined) data.phone = payload.data.phone || null;
  if (payload.data.address !== undefined) data.address = payload.data.address || null;
  if (payload.data.department !== undefined) data.department = payload.data.department || null;
  if (payload.data.newPassword) data.passwordHash = await hashPassword(payload.data.newPassword);

  // Only ADMIN/SUPER_ADMIN can modify work schedule fields
  const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
  if (isAdmin) {
    if (payload.data.workStartTime !== undefined) data.workStartTime = payload.data.workStartTime || null;
    if (payload.data.workEndTime !== undefined) data.workEndTime = payload.data.workEndTime || null;
    if (payload.data.lateGraceMinutes !== undefined) data.lateGraceMinutes = payload.data.lateGraceMinutes;
    if (payload.data.earlyLeaveGraceMinutes !== undefined) data.earlyLeaveGraceMinutes = payload.data.earlyLeaveGraceMinutes;
    if (payload.data.workMode !== undefined) data.workMode = payload.data.workMode;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      address: true,
      department: true,
      role: true,
      workStartTime: true,
      workEndTime: true,
      lateGraceMinutes: true,
      earlyLeaveGraceMinutes: true,
      workMode: true,
      allowedOffDaysPerMonth: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "UPDATE_SELF_PROFILE",
      entityType: "User",
      entityId: user.id,
      beforeJson: JSON.stringify(sanitizeUserForAudit(current)),
      afterJson: JSON.stringify(updated),
    },
  });

  return ok(updated);
}
