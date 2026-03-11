import { NextRequest } from "next/server";
import { z } from "zod";
import { Role, AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { requireRoleRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional().default("ALL"),
  year: z.coerce.number().int().min(2020).max(2099).optional(),
});

/** Admin: list all leave requests */
export async function GET(request: NextRequest) {
  const admin = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!admin) return fail("Unauthorized", 401);

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const q = querySchema.safeParse(params);
  if (!q.success) return fail("Invalid query", 400);

  const where: Record<string, unknown> = {};
  if (q.data.status !== "ALL") where.status = q.data.status;
  if (q.data.year) where.year = q.data.year;

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { username: true, fullName: true, department: true, annualLeaveQuota: true } },
      reviewer: { select: { username: true } },
    },
  });

  return ok(
    requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.user.username,
      department: r.user.department,
      year: r.year,
      dates: JSON.parse(r.dates),
      reason: r.reason,
      status: r.status,
      reviewerName: r.reviewer?.username ?? null,
      reviewedAt: r.reviewedAt,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt,
      quota: r.user.annualLeaveQuota,
    })),
  );
}

const reviewSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED"]),
  rejectedReason: z.string().max(300).optional(),
});

/** Admin: approve or reject a leave request */
export async function PUT(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const admin = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!admin) return fail("Unauthorized", 401);

  const payload = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Dữ liệu không hợp lệ", 400);

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("Missing id", 400);

  const result = await prisma.$transaction(async (tx) => {
    const lr = await tx.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, allowedOffDaysPerMonth: true } } },
    });
    if (!lr) return "NOT_FOUND" as const;
    if (lr.status !== "PENDING") return "ALREADY_REVIEWED" as const;

    await tx.leaveRequest.update({
      where: { id },
      data: {
        status: payload.data.action,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        rejectedReason: payload.data.action === "REJECTED" ? (payload.data.rejectedReason ?? null) : null,
      },
    });

    // If approved, create OFF attendance days
    if (payload.data.action === "APPROVED") {
      const dates: string[] = JSON.parse(lr.dates);
      for (const workDate of dates) {
        // Check if day already has attendance
        const existing = await tx.attendanceDay.findUnique({
          where: { userId_workDate: { userId: lr.userId, workDate } },
        });

        if (existing && (existing.checkInAt || existing.checkOutAt)) {
          continue; // skip days already worked
        }

        const data = {
          isOffDay: true,
          isDeducted: false,
          offReason: `Nghỉ phép năm${lr.reason ? ` - ${lr.reason}` : ""}`,
          status: AttendanceStatus.OFF,
          workedMinutes: 0,
          warningFlagsJson: JSON.stringify(["ANNUAL_LEAVE"]),
          updatedBy: admin.id,
        };

        if (existing) {
          await tx.attendanceDay.update({ where: { id: existing.id }, data });
        } else {
          await tx.attendanceDay.create({
            data: {
              userId: lr.userId,
              workDate,
              createdBy: admin.id,
              ...data,
            },
          });
        }
      }
    }

    return "OK" as const;
  });

  if (result === "NOT_FOUND") return fail("Đơn nghỉ phép không tồn tại", 404);
  if (result === "ALREADY_REVIEWED") return fail("Đơn nghỉ phép đã được duyệt/từ chối trước đó", 409);
  return ok({ status: payload.data.action });
}
