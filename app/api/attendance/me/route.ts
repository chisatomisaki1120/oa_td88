import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vnDateString } from "@/lib/time";

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

  const items = await prisma.attendanceDay.findMany({
    where: {
      userId: user.id,
      workDate: {
        gte: from,
        lte: to,
      },
    },
    include: {
      breakSessions: {
        orderBy: { startAt: "asc" },
      },
    },
    orderBy: { workDate: "desc" },
  });

  return ok(items);
}
