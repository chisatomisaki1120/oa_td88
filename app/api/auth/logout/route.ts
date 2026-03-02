import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { destroySession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return fail("Invalid CSRF token", 403);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  await destroySession(token);

  const response = ok({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(new Date(0)));
  return response;
}
