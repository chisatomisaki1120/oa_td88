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
  const actor = await requireRoleRequest(request, [Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  const existing = await prisma.monthlyClosure.findUnique({ where: { month: payload.data.month } });
  if (!existing) return fail("Tháng này chưa được chốt", 404);

  const closure = await prisma.monthlyClosure.update({
    where: { month: payload.data.month },
    data: {
      reopenedAt: new Date(),
      reopenedBy: actor.id,
      note: payload.data.note ?? existing.note,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: "MONTHLY_REOPEN",
      entityType: "MonthlyClosure",
      entityId: closure.id,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(closure),
    },
  });

  return ok(closure);
}
