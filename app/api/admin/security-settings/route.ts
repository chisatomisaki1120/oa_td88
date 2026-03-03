import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { getLoginSecurityConfig, saveLoginSecurityConfig } from "@/lib/login-security-config";
import { requireRoleRequest } from "@/lib/rbac";

const schema = z.object({
  enforceSingleDevicePerAccount: z.boolean(),
  enforceSingleAccountPerDeviceIp: z.boolean(),
  blockMobilePhoneLogin: z.boolean(),
});

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  return ok(await getLoginSecurityConfig());
}

export async function PATCH(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("Invalid payload", 400, payload.error.flatten());

  return ok(await saveLoginSecurityConfig(payload.data));
}
