import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { getSessionUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  const csrfToken = request.cookies.get(CSRF_COOKIE)?.value ?? createCsrfToken();

  const response = ok({ user, csrfToken });
  if (!request.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return response;
}
