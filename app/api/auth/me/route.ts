import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { getSessionUserFromRequest } from "@/lib/auth";
import { CSRF_COOKIE_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? createCsrfToken();

  const response = ok({ user, csrfToken });
  if (!request.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set(CSRF_COOKIE, csrfToken, CSRF_COOKIE_OPTIONS);
  }
  return response;
}
