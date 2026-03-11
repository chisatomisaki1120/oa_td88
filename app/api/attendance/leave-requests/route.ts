import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { getSessionUserFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { consumeApiRateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(15),
  reason: z.string().max(300).optional(),
});

/** Employee: list own leave requests for a year */
export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();

  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id, year },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { username: true } } },
  });

  // Count used annual leave days (approved) this year
  const approved = requests.filter((r) => r.status === "APPROVED");
  const usedDays = approved.reduce((sum, r) => sum + JSON.parse(r.dates).length, 0);

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { annualLeaveQuota: true },
  });

  return ok({
    requests: requests.map((r) => ({
      ...r,
      dates: JSON.parse(r.dates),
      reviewerName: r.reviewer?.username ?? null,
    })),
    quota: me?.annualLeaveQuota ?? 15,
    usedDays,
  });
}

/** Employee: create a new annual leave request */
export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);
  const user = await getSessionUserFromRequest(request);
  if (!user) return fail("Unauthorized", 401);

  const rl = consumeApiRateLimit(`leave-req:${user.id}`);
  if (!rl.allowed) return fail(`Vui lòng thử lại sau ${rl.retryAfterSeconds}s`, 429);

  const payload = createSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Dữ liệu không hợp lệ", 400, payload.error.flatten());

  const uniqueDates = Array.from(new Set(payload.data.dates)).sort();
  const year = Number(uniqueDates[0].slice(0, 4));

  // All dates must be in the same year
  if (uniqueDates.some((d) => d.slice(0, 4) !== String(year))) {
    return fail("Tất cả ngày phải trong cùng một năm", 400);
  }

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { annualLeaveQuota: true },
  });
  if (!me) return fail("Không tìm thấy tài khoản", 404);

  // Count already used + pending annual leave days this year
  const existing = await prisma.leaveRequest.findMany({
    where: {
      userId: user.id,
      year,
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: { dates: true },
  });

  const usedOrPending = existing.reduce((sum, r) => sum + JSON.parse(r.dates).length, 0);

  if (usedOrPending + uniqueDates.length > me.annualLeaveQuota) {
    const remaining = Math.max(0, me.annualLeaveQuota - usedOrPending);
    return fail(`Bạn chỉ còn ${remaining} ngày nghỉ phép năm (hạn mức ${me.annualLeaveQuota} ngày/năm)`, 400);
  }

  // Check overlap with existing requests
  const allPendingApprovedDates = existing.flatMap((r) => JSON.parse(r.dates) as string[]);
  const overlap = uniqueDates.filter((d) => allPendingApprovedDates.includes(d));
  if (overlap.length > 0) {
    return fail(`Ngày ${overlap.join(", ")} đã có trong đơn nghỉ phép khác`, 400);
  }

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      year,
      dates: JSON.stringify(uniqueDates),
      reason: payload.data.reason ?? null,
    },
  });

  return ok({ id: leaveRequest.id, dates: uniqueDates, status: leaveRequest.status });
}
