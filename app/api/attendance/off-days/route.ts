import { NextRequest } from "next/server";
import { z } from "zod";
import { AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { consumeApiRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
  reason: z.string().max(300).optional(),
});

type OffDayBulkResult = {
  updatedDates: string[];
  skippedAlreadyAttended: string[];
  skippedAlreadyOff: string[];
};

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`off-days:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const uniqueDates = Array.from(new Set(payload.data.dates)).sort();
  const reason = payload.data.reason ?? null;

  const result = await prisma.$transaction(async (tx): Promise<OffDayBulkResult | "USER_NOT_FOUND"> => {
    const me = await tx.user.findUnique({
      where: { id: user.id },
      select: { allowedOffDaysPerMonth: true },
    });
    if (!me) return "USER_NOT_FOUND";

    const existingDays = await tx.attendanceDay.findMany({
      where: {
        userId: user.id,
        workDate: { in: uniqueDates },
      },
      select: { id: true, workDate: true, checkInAt: true, checkOutAt: true, isOffDay: true },
    });
    const dayMap = new Map(existingDays.map((d) => [d.workDate, d]));

    const skippedAlreadyAttended: string[] = [];
    const skippedAlreadyOff: string[] = [];
    const candidates: string[] = [];

    for (const workDate of uniqueDates) {
      const existing = dayMap.get(workDate);
      if (existing?.checkInAt || existing?.checkOutAt) {
        skippedAlreadyAttended.push(workDate);
        continue;
      }
      if (existing?.isOffDay) {
        skippedAlreadyOff.push(workDate);
        continue;
      }
      candidates.push(workDate);
    }

    const byMonth = new Map<string, string[]>();
    for (const d of candidates) {
      const m = d.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
    }

    const updatedDates: string[] = [];

    for (const [month, datesInMonth] of byMonth) {
      const usedOff = await tx.attendanceDay.count({
        where: {
          userId: user.id,
          workDate: { gte: `${month}-01`, lte: `${month}-31` },
          isOffDay: true,
        },
      });

      let runningUsed = usedOff;
      for (const workDate of datesInMonth.sort()) {
        runningUsed += 1;
        const isDeducted = runningUsed > me.allowedOffDaysPerMonth;
        const existing = dayMap.get(workDate);

        const data = {
          isOffDay: true,
          isDeducted,
          offReason: reason,
          status: AttendanceStatus.OFF,
          workedMinutes: 0,
          warningFlagsJson: JSON.stringify(isDeducted ? ["OFF_DAY_DEDUCTED"] : ["OFF_DAY_ALLOWED"]),
          updatedBy: user.id,
        };

        if (existing) {
          await tx.attendanceDay.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await tx.attendanceDay.create({
            data: {
              userId: user.id,
              workDate,
              createdBy: user.id,
              ...data,
            },
          });
        }
        updatedDates.push(workDate);
      }
    }

    return {
      updatedDates,
      skippedAlreadyAttended,
      skippedAlreadyOff,
    };
  });

  if (result === "USER_NOT_FOUND") return fail("Không tìm thấy tài khoản", 404);
  return ok(result);
}

// ── Cancel off-days ──

const deleteSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
});

export async function DELETE(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`off-days-del:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const payload = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const uniqueDates = Array.from(new Set(payload.data.dates)).sort();

  const result = await prisma.$transaction(async (tx) => {
    const days = await tx.attendanceDay.findMany({
      where: {
        userId: user.id,
        workDate: { in: uniqueDates },
        isOffDay: true,
      },
      select: { id: true, workDate: true, checkInAt: true, checkOutAt: true },
    });

    const cancelledDates: string[] = [];
    const skippedHasAttendance: string[] = [];

    for (const day of days) {
      if (day.checkInAt || day.checkOutAt) {
        skippedHasAttendance.push(day.workDate);
        continue;
      }

      await tx.attendanceDay.update({
        where: { id: day.id },
        data: {
          isOffDay: false,
          isDeducted: false,
          offReason: null,
          status: AttendanceStatus.INCOMPLETE,
          workedMinutes: null,
          warningFlagsJson: "[]",
          updatedBy: user.id,
        },
      });
      cancelledDates.push(day.workDate);
    }

    return { cancelledDates, skippedHasAttendance };
  });

  return ok(result);
}
