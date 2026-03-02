import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { DEFAULT_BREAK_POLICY } from "@/lib/attendance";

const schema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  lateGraceMinutes: z.number().int().min(0).default(5),
  earlyLeaveGraceMinutes: z.number().int().min(0).default(5),
  breakPolicyJson: z.any().optional(),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const shifts = await prisma.shift.findMany({ orderBy: { createdAt: "desc" } });
  return ok(shifts);
}

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const shift = await prisma.shift.create({
    data: {
      ...payload.data,
      breakPolicyJson: JSON.stringify(payload.data.breakPolicyJson ?? DEFAULT_BREAK_POLICY),
    },
  });

  return ok(shift, { status: 201 });
}
