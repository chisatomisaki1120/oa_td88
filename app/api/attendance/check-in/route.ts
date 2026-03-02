import { NextRequest } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { assertMonthUnlocked, computeCheckInStatus, getActiveShiftForUser, getOrCreateTodayAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { vnDateString } from "@/lib/time";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const workDate = vnDateString();
  if (!(await assertMonthUnlocked(workDate))) return fail("Tháng này đã khóa công", 409);

  const result = await prisma
    .$transaction(async (tx) => {
      const today = await getOrCreateTodayAttendance(tx, user.id);
      if (today.checkInAt) throw new Error("ALREADY_CHECKED_IN");
      if (today.isOffDay) throw new Error("OFF_DAY");

      const now = new Date();
      const shift = await getActiveShiftForUser(user.id, now);
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
      throw e;
    });

  if (!result) return fail("Bạn đã check-in hôm nay", 409);
  if (result === "OFF_DAY") return fail("Bạn đã báo off cho hôm nay", 409);
  return ok(result);
}
