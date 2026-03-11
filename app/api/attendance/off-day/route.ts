import { NextRequest } from "next/server";
import { z } from "zod";
import { AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getOrCreateTodayAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { vnDateString } from "@/lib/time";
import { consumeApiRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  reason: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`off-day:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const workDate = vnDateString();

  const result = await prisma.$transaction(async (tx) => {
    const today = await getOrCreateTodayAttendance(tx, user.id);

    if (today.checkInAt || today.checkOutAt) throw new Error("ALREADY_ATTENDED");
    if (today.isOffDay) throw new Error("ALREADY_OFF");

    const me = await tx.user.findUnique({
      where: { id: user.id },
      select: { allowedOffDaysPerMonth: true },
    });
    if (!me) throw new Error("USER_NOT_FOUND");

    const month = workDate.slice(0, 7);
    const usedOff = await tx.attendanceDay.count({
      where: {
        userId: user.id,
        workDate: { gte: `${month}-01`, lte: `${month}-31` },
        isOffDay: true,
      },
    });

    const nextUsed = usedOff + 1;
    const isDeducted = nextUsed > me.allowedOffDaysPerMonth;

    return tx.attendanceDay.update({
      where: { id: today.id },
      data: {
        isOffDay: true,
        isDeducted,
        offReason: payload.data.reason ?? null,
        status: AttendanceStatus.OFF,
        workedMinutes: 0,
        warningFlagsJson: JSON.stringify(isDeducted ? ["OFF_DAY_DEDUCTED"] : ["OFF_DAY_ALLOWED"]),
        updatedBy: user.id,
      },
    });
  }).catch((e) => {
    if (e instanceof Error && ["ALREADY_ATTENDED", "ALREADY_OFF", "USER_NOT_FOUND"].includes(e.message)) return e.message;
    throw e;
  });

  if (result === "ALREADY_ATTENDED") return fail("Bạn đã check-in/check-out, không thể báo off", 409);
  if (result === "ALREADY_OFF") return fail("Bạn đã báo off hôm nay", 409);
  if (result === "USER_NOT_FOUND") return fail("Không tìm thấy tài khoản", 404);

  return ok(result);
}
