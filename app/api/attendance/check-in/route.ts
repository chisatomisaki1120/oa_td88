import { NextRequest } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { assertMonthUnlocked, computeCheckInStatus, getActiveShiftForUser, getOrCreateCurrentShiftAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const result = await prisma
    .$transaction(async (tx) => {
      const now = new Date();
      const today = await getOrCreateCurrentShiftAttendance(tx, user.id, now);
      if (!(await assertMonthUnlocked(today.workDate))) throw new Error("MONTH_LOCKED");
      if (today.checkInAt) throw new Error("ALREADY_CHECKED_IN");
      if (today.isOffDay) throw new Error("OFF_DAY");

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
      if (e instanceof Error && e.message === "MONTH_LOCKED") return "MONTH_LOCKED" as const;
      if (e instanceof Error && e.message === "ALREADY_CHECKED_IN") return null;
      if (e instanceof Error && e.message === "OFF_DAY") return "OFF_DAY" as const;
      throw e;
    });

  if (result === "MONTH_LOCKED") return fail("Tháng này đã khóa công", 409);
  if (!result) return fail("Bạn đã check-in ca hiện tại", 409);
  if (result === "OFF_DAY") return fail("Bạn đã báo off cho hôm nay", 409);
  return ok(result);
}
