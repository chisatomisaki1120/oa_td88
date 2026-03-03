import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { getLoginSecurityConfig } from "@/lib/login-security-config";
import { prisma } from "@/lib/prisma";
import { consumeLoginAttempt } from "@/lib/rate-limit";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/csrf";

const DEVICE_IP_WINDOW_MINUTES = 10;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getDeviceKey(ipAddress: string, userAgent: string): string {
  return createHash("sha256").update(`${ipAddress}|${userAgent}`).digest("hex");
}

function isMobilePhoneUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isTablet = /ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
  if (isTablet) return false;
  return /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|mobile/.test(ua);
}

async function markSharedRisk(userId: string, relatedUserIds: string[]) {
  const allIds = Array.from(new Set([userId, ...relatedUserIds]));
  if (allIds.length === 0) return;
  await prisma.user.updateMany({
    where: { id: { in: allIds } },
    data: { hasSharedLoginRisk: true },
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const deviceKey = getDeviceKey(ip, userAgent);
  const securityConfig = await getLoginSecurityConfig();
  const limit = consumeLoginAttempt(ip);
  if (!limit.allowed) {
    return fail("Too many login attempts", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid payload", 400, parsed.error.flatten());
  }

  if (securityConfig.blockMobilePhoneLogin && isMobilePhoneUserAgent(userAgent)) {
    await prisma.loginAccessLog.create({
      data: {
        usernameInput: parsed.data.username,
        ipAddress: ip,
        userAgent,
        deviceKey,
        success: false,
        blockedReason: "MOBILE_DEVICE_BLOCKED",
      },
    });
    return fail("Không cho phép đăng nhập từ điện thoại", 403);
  }

  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (!user || !user.isActive) {
    await prisma.loginAccessLog.create({
      data: {
        usernameInput: parsed.data.username,
        ipAddress: ip,
        userAgent,
        deviceKey,
        success: false,
        failedReason: "INVALID_CREDENTIALS",
      },
    });
    return fail("Invalid credentials", 401);
  }

  const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isValid) {
    await prisma.loginAccessLog.create({
      data: {
        userId: user.id,
        usernameInput: parsed.data.username,
        ipAddress: ip,
        userAgent,
        deviceKey,
        success: false,
        failedReason: "INVALID_CREDENTIALS",
      },
    });
    return fail("Invalid credentials", 401);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - DEVICE_IP_WINDOW_MINUTES * 60 * 1000);

  await prisma.authSession.deleteMany({ where: { expiresAt: { lte: now } } });

  if (securityConfig.enforceSingleDevicePerAccount) {
    const userActiveSessions = await prisma.authSession.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      select: { deviceKey: true },
    });
    const hasOtherDeviceSession = userActiveSessions.some((s) => s.deviceKey !== deviceKey);
    if (hasOtherDeviceSession) {
      await prisma.loginAccessLog.create({
        data: {
          userId: user.id,
          usernameInput: parsed.data.username,
          ipAddress: ip,
          userAgent,
          deviceKey,
          success: false,
          blockedReason: "ACCOUNT_ACTIVE_ON_OTHER_DEVICE",
        },
      });
      return fail("Tài khoản đang đăng nhập trên thiết bị khác", 409);
    }
  }

  if (securityConfig.enforceSingleAccountPerDeviceIp) {
    const recentConflict = await prisma.loginAccessLog.findFirst({
      where: {
        success: true,
        createdAt: { gte: windowStart },
        userId: { not: user.id },
        OR: [{ ipAddress: ip }, { deviceKey }],
      },
      select: { userId: true, ipAddress: true, deviceKey: true },
    });

    if (recentConflict) {
      const sameIp = recentConflict.ipAddress === ip;
      const sameDevice = recentConflict.deviceKey === deviceKey;
      await prisma.loginAccessLog.create({
        data: {
          userId: user.id,
          usernameInput: parsed.data.username,
          ipAddress: ip,
          userAgent,
          deviceKey,
          success: false,
          blockedReason: "DEVICE_OR_IP_LOCKED_10_MINUTES",
          isSharedIp: sameIp,
          isSharedDevice: sameDevice,
        },
      });
      await markSharedRisk(user.id, recentConflict.userId ? [recentConflict.userId] : []);
      return fail("Thiết bị/IP này đã đăng nhập tài khoản khác trong 10 phút gần đây", 409);
    }
  }

  const [sharedIpRows, sharedDeviceRows] = await Promise.all([
    prisma.loginAccessLog.findMany({
      where: { success: true, ipAddress: ip, userId: { not: user.id } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.loginAccessLog.findMany({
      where: { success: true, deviceKey, userId: { not: user.id } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const sharedIpUserIds = sharedIpRows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const sharedDeviceUserIds = sharedDeviceRows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const isSharedIp = sharedIpUserIds.length > 0;
  const isSharedDevice = sharedDeviceUserIds.length > 0;

  if (isSharedIp || isSharedDevice) {
    await markSharedRisk(user.id, [...sharedIpUserIds, ...sharedDeviceUserIds]);
  }

  if (securityConfig.enforceSingleDevicePerAccount) {
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
  }

  const token = await createSession(user.id, {
    ipAddress: ip,
    userAgent,
    deviceKey,
    isSharedIp,
    isSharedDevice,
  });

  await prisma.loginAccessLog.create({
    data: {
      userId: user.id,
      usernameInput: parsed.data.username,
      ipAddress: ip,
      userAgent,
      deviceKey,
      success: true,
      isSharedIp,
      isSharedDevice,
    },
  });

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
