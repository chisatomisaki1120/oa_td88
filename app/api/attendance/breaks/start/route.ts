import { NextRequest } from "next/server";
import { BreakType } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getOrCreateCurrentShiftAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { consumeApiRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  breakType: z.nativeEnum(BreakType).default(BreakType.OTHER),
});

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`break-start:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) return fail("Dữ liệu không hợp lệ", 400, payload.error.flatten());

  const result = await prisma.$transaction(async (tx) => {
    const today = await getOrCreateCurrentShiftAttendance(tx, user.id, new Date());
    if (!today.checkInAt) throw new Error("NO_CHECKIN");
    if (today.checkOutAt) throw new Error("ALREADY_CHECKOUT");

    // Skip month lock for active shifts — employee already checked in (month was unlocked then)
    // This allows break operations for overnight shifts spanning month boundaries

    const openBreak = await tx.breakSession.findFirst({ where: { attendanceDayId: today.id, endAt: null } });
    if (openBreak) throw new Error("BREAK_OPEN");

    return tx.breakSession.create({
      data: {
        attendanceDayId: today.id,
        breakType: payload.data.breakType,
        startAt: new Date(),
      },
    });
  }).catch((e) => {
    if (e instanceof Error && ["NO_CHECKIN", "ALREADY_CHECKOUT", "BREAK_OPEN"].includes(e.message)) return e.message;
    throw e;
  });

  if (result === "NO_CHECKIN") return fail("Bạn chưa check-in", 409);
  if (result === "ALREADY_CHECKOUT") return fail("Bạn đã check-out", 409);
  if (result === "BREAK_OPEN") return fail("Bạn đã bắt đầu nghỉ trước đó", 409);

  return ok(result);
}
