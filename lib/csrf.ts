import { randomBytes } from "crypto";
import { NextRequest } from "next/server";

export const CSRF_COOKIE = "oa_csrf";

export function createCsrfToken(): string {
  return randomBytes(24).toString("hex");
}

export function validateCsrf(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}
