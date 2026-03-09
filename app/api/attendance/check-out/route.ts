import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { assertMonthUnlocked, getActiveShiftForUser, getOrCreateCurrentShiftAttendance, getScheduleReferenceForAttendance, recalculateAttendanceDay } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { consumeApiRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`checkout:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const result = await prisma.$transaction(async (tx) => {
    const today = await getOrCreateCurrentShiftAttendance(tx, user.id, new Date());
    if (!(await assertMonthUnlocked(today.workDate, tx))) throw new Error("MONTH_LOCKED");

    if (!today.checkInAt) throw new Error("NO_CHECKIN");
    if (today.checkOutAt) throw new Error("ALREADY_CHECKOUT");

    const openBreak = await tx.breakSession.findFirst({
      where: { attendanceDayId: today.id, endAt: null },
      orderBy: { startAt: "desc" },
    });
    if (openBreak) throw new Error("BREAK_OPEN");

    const updated = await tx.attendanceDay.update({
      where: { id: today.id },
      data: { checkOutAt: new Date(), updatedBy: user.id },
    });

    const shift = await getActiveShiftForUser(user.id, getScheduleReferenceForAttendance(updated), tx);
    return recalculateAttendanceDay(tx, updated, shift);
  }).catch((e) => {
    if (!(e instanceof Error)) throw e;
    if (e.message === "MONTH_LOCKED") return "MONTH_LOCKED" as const;
    if (e.message === "NO_CHECKIN") return "NO_CHECKIN" as const;
    if (e.message === "ALREADY_CHECKOUT") return "ALREADY_CHECKOUT" as const;
    if (e.message === "BREAK_OPEN") return "BREAK_OPEN" as const;
    if (e.message === "PREVIOUS_SHIFT_NOT_CHECKED_OUT") return "PREVIOUS_SHIFT_NOT_CHECKED_OUT" as const;
    throw e;
  });

  if (result === "MONTH_LOCKED") return fail("Tháng này đã khóa công", 409);
  if (result === "NO_CHECKIN") return fail("Bạn chưa check-in", 409);
  if (result === "ALREADY_CHECKOUT") return fail("Bạn đã check-out", 409);
  if (result === "BREAK_OPEN") return fail("Bạn đang trong phiên nghỉ, vui lòng kết thúc nghỉ trước", 409);
  if (result === "PREVIOUS_SHIFT_NOT_CHECKED_OUT") return fail("Bạn chưa xuống ca của ngày làm việc trước đó. Vui lòng liên hệ quản lý để xử lý trước khi thao tác tiếp.", 409);

  return ok(result);
}
