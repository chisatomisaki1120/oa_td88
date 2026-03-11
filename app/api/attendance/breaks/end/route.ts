import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getActiveShiftForUser, getOrCreateCurrentShiftAttendance, getScheduleReferenceForAttendance, recalculateAttendanceDay } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { minutesBetween } from "@/lib/time";
import { consumeApiRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`break-end:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const result = await prisma.$transaction(async (tx) => {
    const today = await getOrCreateCurrentShiftAttendance(tx, user.id, new Date());
    if (!today.checkInAt) throw new Error("NO_CHECKIN");

    // Skip month lock for active shifts — employee already checked in (month was unlocked then)
    // This allows break-end for overnight shifts spanning month boundaries

    const openBreak = await tx.breakSession.findFirst({
      where: { attendanceDayId: today.id, endAt: null },
      orderBy: { startAt: "desc" },
    });
    if (!openBreak) throw new Error("NO_OPEN_BREAK");

    await tx.breakSession.update({
      where: { id: openBreak.id },
      data: {
        endAt: new Date(),
        durationMinutesComputed: minutesBetween(openBreak.startAt, new Date()),
      },
    });

    const updatedAttendance = await tx.attendanceDay.findUnique({ where: { id: today.id } });
    if (!updatedAttendance) throw new Error("ATTENDANCE_NOT_FOUND");

    const shift = await getActiveShiftForUser(user.id, getScheduleReferenceForAttendance(updatedAttendance), tx);
    return recalculateAttendanceDay(tx, updatedAttendance, shift);
  }).catch((e) => {
    if (e instanceof Error && ["NO_CHECKIN", "NO_OPEN_BREAK", "ATTENDANCE_NOT_FOUND"].includes(e.message)) return e.message;
    throw e;
  });

  if (result === "NO_CHECKIN") return fail("Bạn chưa check-in", 409);
  if (result === "NO_OPEN_BREAK") return fail("Không có phiên nghỉ đang mở", 409);
  if (result === "ATTENDANCE_NOT_FOUND") return fail("Không tìm thấy bản ghi công", 404);

  return ok(result);
}
