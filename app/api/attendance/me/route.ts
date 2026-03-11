import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vnDateString } from "@/lib/time";
import { getPendingPreviousOpenAttendance } from "@/lib/attendance";

function parseDate(input: string | null, fallback: string) {
  if (!input) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return fallback;
  return input;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const today = vnDateString();
  const from = parseDate(searchParams.get("from"), `${today.slice(0, 7)}-01`);
  const to = parseDate(searchParams.get("to"), today);

  const [items, pendingPreviousShift] = await Promise.all([
    prisma.attendanceDay.findMany({
    where: {
      userId: user.id,
      workDate: {
        gte: from,
        lte: to,
      },
    },
    select: {
      id: true,
      workDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workedMinutes: true,
      isOffDay: true,
      isDeducted: true,
      offReason: true,
      warningFlagsJson: true,
      breakSessions: {
        select: {
          id: true,
          breakType: true,
          startAt: true,
          endAt: true,
          durationMinutesComputed: true,
        },
        orderBy: { startAt: "asc" },
      },
    },
    orderBy: { workDate: "desc" },
  }),
    prisma.$transaction((tx) =>
      getPendingPreviousOpenAttendance(tx, user.id).then((item) =>
        item
          ? {
              id: item.id,
              workDate: item.workDate,
              checkInAt: item.checkInAt,
              checkOutAt: item.checkOutAt,
            }
          : null,
      ),
    ),
  ]);

  return ok(
    {
      items,
      pendingPreviousShift,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
