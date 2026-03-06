import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_DAYS, SESSION_TOUCH_INTERVAL_MS } from "@/lib/constants";

export const SESSION_COOKIE = "oa_session";
const SHORT_SESSION_DAYS = 1;

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  department: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

type SessionMeta = {
  ipAddress: string;
  userAgent: string | null;
  deviceKey: string;
  isSharedIp?: boolean;
  isSharedDevice?: boolean;
};

export async function createSession(userId: string, meta: SessionMeta & { rememberMe?: boolean }): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const days = meta.rememberMe ? SESSION_DAYS : SHORT_SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      deviceKey: meta.deviceKey,
      isSharedIp: Boolean(meta.isSharedIp),
      isSharedDevice: Boolean(meta.isSharedDevice),
      expiresAt,
    },
  });
  return rawToken;
}

export async function destroySession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }
  await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function getSessionUserFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return getSessionUserFromToken(token);
}

export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return getSessionUserFromToken(token);
}

async function getSessionUserFromToken(token: string): Promise<SessionUser | null> {
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          department: true,
          isActive: true,
        },
      },
    },
  });

  if (!session || !session.user || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  const now = new Date();
  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await prisma.authSession
      .update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role,
    department: session.user.department,
  };
}

export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function canAccessRole(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}
