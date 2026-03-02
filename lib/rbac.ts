import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { canAccessRole, getSessionUserFromCookies, getSessionUserFromRequest } from "@/lib/auth";

export async function requireUser(request: NextRequest) {
  return getSessionUserFromRequest(request);
}

export async function requireRoleRequest(request: NextRequest, roles: Role[]) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return null;
  if (!canAccessRole(user.role, roles)) return null;
  return user;
}

export async function requireRoleServer(roles: Role[]) {
  const user = await getSessionUserFromCookies();
  if (!user) {
    return null;
  }
  if (!canAccessRole(user.role, roles)) {
    return null;
  }
  return user;
}
