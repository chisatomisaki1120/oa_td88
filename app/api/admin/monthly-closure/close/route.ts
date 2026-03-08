import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

const schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const closure = await prisma.$transaction(async (tx) => {
    const result = await tx.monthlyClosure.upsert({
      where: { month: payload.data.month },
      update: {
        closedAt: new Date(),
        closedBy: actor.id,
        reopenedAt: null,
        reopenedBy: null,
        note: payload.data.note,
      },
      create: {
        month: payload.data.month,
        closedAt: new Date(),
        closedBy: actor.id,
        note: payload.data.note,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "MONTHLY_CLOSE",
        entityType: "MonthlyClosure",
        entityId: result.id,
        afterJson: JSON.stringify(result),
      },
    });

    return result;
  });

  return ok(closure);
}
