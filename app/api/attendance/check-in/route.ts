import { NextRequest } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { computeCheckInStatus, getActiveShiftForUser, getOrCreateCurrentShiftAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { consumeApiRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`checkin:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const result = await prisma
    .$transaction(async (tx) => {
      const now = new Date();
      const today = await getOrCreateCurrentShiftAttendance(tx, user.id, now);
      if (today.checkInAt) throw new Error("ALREADY_CHECKED_IN");
      if (today.isOffDay) throw new Error("OFF_DAY");

      const shift = await getActiveShiftForUser(user.id, now, tx);
      const status = computeCheckInStatus(shift, now);

      return tx.attendanceDay.update({
        where: { id: today.id },
        data: {
          checkInAt: now,
          status,
          updatedBy: user.id,
          warningFlagsJson: status === AttendanceStatus.LATE ? JSON.stringify(["LATE"]) : "[]",
        },
        include: { breakSessions: true },
      });
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "ALREADY_CHECKED_IN") return null;
      if (e instanceof Error && e.message === "OFF_DAY") return "OFF_DAY" as const;
      if (e instanceof Error && e.message === "PREVIOUS_SHIFT_OPEN") return "PREVIOUS_SHIFT_OPEN" as const;
      throw e;
    });

  if (!result) return fail("Bạn đã check-in ca hiện tại", 409);
  if (result === "OFF_DAY") return fail("Bạn đã báo off cho hôm nay", 409);
  if (result === "PREVIOUS_SHIFT_OPEN") return fail("Bạn chưa xuống ca ngày hôm trước. Vui lòng liên hệ quản lý để xử lý.", 409);
  return ok(result);
}
