import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeLoginAttempt } from "@/lib/rate-limit";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/csrf";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = consumeLoginAttempt(ip);
  if (!limit.allowed) {
    return fail("Too many login attempts", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid payload", 400, parsed.error.flatten());
  }

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !user.isActive) {
    return fail("Invalid credentials", 401);
  }

  const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return fail("Invalid credentials", 401);
  }

  const token = await createSession(user.id);
  const response = ok({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
    },
  });

  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)));
  response.cookies.set(CSRF_COOKIE, createCsrfToken(), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
