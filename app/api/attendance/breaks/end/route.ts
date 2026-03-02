import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { assertMonthUnlocked, getActiveShiftForUser, getOrCreateTodayAttendance, recalculateAttendanceDay } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { minutesBetween, vnDateString } from "@/lib/time";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const workDate = vnDateString();
  if (!(await assertMonthUnlocked(workDate))) {
    return fail("Tháng này đã khóa công", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const today = await getOrCreateTodayAttendance(tx, user.id);
    if (!today.checkInAt) throw new Error("NO_CHECKIN");

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

    const shift = await getActiveShiftForUser(user.id, new Date());
    return recalculateAttendanceDay(tx, today, shift);
  }).catch((e) => {
    if (e instanceof Error) return e.message;
    throw e;
  });

  if (result === "NO_CHECKIN") return fail("Bạn chưa check-in", 409);
  if (result === "NO_OPEN_BREAK") return fail("Không có phiên nghỉ đang mở", 409);

  return ok(result);
}
