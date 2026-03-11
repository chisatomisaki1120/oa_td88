import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

// GET /api/admin/sessions - list all active sessions
export async function GET(request: NextRequest) {
  const user = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) return fail("Unauthorized", 401);

  const sessions = await prisma.authSession.findMany({
    where: {
      expiresAt: { gt: new Date() },
      ...(user.role === Role.SUPER_ADMIN ? {} : { user: { role: { not: Role.SUPER_ADMIN } } }),
    },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      user: { select: { id: true, fullName: true, username: true, role: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return ok(sessions);
}

// DELETE /api/admin/sessions - admin revoke any session
export async function DELETE(request: NextRequest) {
  const user = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) return fail("Unauthorized", 401);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;
  if (!sessionId || typeof sessionId !== "string") return fail("sessionId is required", 400);

  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    include: { user: { select: { role: true } } },
  });
  if (!session) return fail("Phiên không tồn tại", 404);

  if (session.user.role === Role.SUPER_ADMIN && user.role !== Role.SUPER_ADMIN) {
    return fail("Admin không được thu hồi phiên của SuperAdmin", 403);
  }

  await prisma.authSession.delete({ where: { id: sessionId } });
  return ok({ deleted: sessionId });
}
