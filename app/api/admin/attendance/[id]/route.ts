import { NextRequest } from "next/server";
import { AttendanceStatus, Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { getActiveShiftForUser, recalculateAttendanceDay } from "@/lib/attendance";
import { WARNING_FLAGS } from "@/lib/constants";

const schema = z.object({
  checkInAt: z.string().datetime().nullable().optional(),
  checkOutAt: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  warningFlagsJson: z.array(z.enum(WARNING_FLAGS)).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const { id } = await params;
  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const existing = await prisma.attendanceDay.findUnique({ where: { id } });
  if (!existing) return fail("Không tìm thấy bản ghi", 404);

  const data: Record<string, unknown> = {
    updatedBy: actor.id,
  };
  if (payload.data.checkInAt !== undefined) data.checkInAt = payload.data.checkInAt ? new Date(payload.data.checkInAt) : null;
  if (payload.data.checkOutAt !== undefined) data.checkOutAt = payload.data.checkOutAt ? new Date(payload.data.checkOutAt) : null;

  const finalCheckIn = (data.checkInAt !== undefined ? data.checkInAt : existing.checkInAt) as Date | null;
  const finalCheckOut = (data.checkOutAt !== undefined ? data.checkOutAt : existing.checkOutAt) as Date | null;
  if (finalCheckIn && finalCheckOut && finalCheckOut <= finalCheckIn) {
    return fail("Giờ ra phải sau giờ vào", 400);
  }
  if (payload.data.status !== undefined) data.status = payload.data.status;
  if (payload.data.warningFlagsJson !== undefined) data.warningFlagsJson = JSON.stringify(payload.data.warningFlagsJson);

  const updated = await prisma.$transaction(async (tx) => {
    const modified = await tx.attendanceDay.update({
      where: { id },
      data,
    });

    const shift = await getActiveShiftForUser(modified.userId, new Date(`${modified.workDate}T12:00:00.000+07:00`), tx);
    return recalculateAttendanceDay(tx, modified, shift);
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "UPDATE_ATTENDANCE",
      entityType: "AttendanceDay",
      entityId: id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
    },
  });

  return ok(updated);
}
