import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { LoginConflictType } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { SESSION_DAYS } from "@/lib/constants";
import { getLoginSecurityConfig } from "@/lib/login-security-config";
import { prisma } from "@/lib/prisma";
import { consumeLoginAttempt } from "@/lib/rate-limit";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { parseWorkDateToUtc, vnDateString } from "@/lib/time";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
  clientDevice: z
    .object({
      userAgent: z.string().optional(),
      platform: z.string().optional(),
      maxTouchPoints: z.number().int().min(0).max(32).optional(),
      screenWidth: z.number().int().min(0).max(10000).optional(),
      screenHeight: z.number().int().min(0).max(10000).optional(),
      userAgentDataMobile: z.boolean().optional(),
    })
    .optional(),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function getDeviceKey(
  userAgent: string,
  clientDevice:
    | {
        userAgent?: string;
        platform?: string;
        maxTouchPoints?: number;
        screenWidth?: number;
        screenHeight?: number;
      }
    | undefined,
): string {
  const stablePayload = [
    clientDevice?.userAgent || userAgent,
    clientDevice?.platform || "",
    String(clientDevice?.maxTouchPoints ?? 0),
    String(clientDevice?.screenWidth ?? 0),
    String(clientDevice?.screenHeight ?? 0),
  ].join("|");
  return createHash("sha256").update(stablePayload).digest("hex");
}

function isMobilePhoneUserAgent(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isTablet = /ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
  if (isTablet) return false;
  return /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|mobile/.test(ua);
}

function isMobilePhoneByClientSignal(
  signal:
    | {
        userAgent?: string;
        platform?: string;
        maxTouchPoints?: number;
        screenWidth?: number;
        screenHeight?: number;
        userAgentDataMobile?: boolean;
      }
    | undefined,
): boolean {
  if (!signal) return false;

  if (signal.userAgentDataMobile === true) return true;

  const ua = (signal.userAgent ?? "").toLowerCase();
  if (ua) {
    const isTablet = /ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
    if (!isTablet && /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|mobile/.test(ua)) {
      return true;
    }
  }

  // iPhone "Request Desktop Website" often reports MacIntel but still has touch points.
  if ((signal.platform ?? "").toLowerCase() === "macintel" && (signal.maxTouchPoints ?? 0) > 1) {
    return true;
  }

  return false;
}

function isMobilePhoneRequest(request: NextRequest, userAgent: string, clientDevice: z.infer<typeof loginSchema>["clientDevice"]): boolean {
  if (isMobilePhoneUserAgent(userAgent)) return true;

  const chMobile = request.headers.get("sec-ch-ua-mobile");
  if (chMobile === "?1") return true;

  return isMobilePhoneByClientSignal(clientDevice);
}

async function markSharedRisk(userId: string, relatedUserIds: string[]) {
  const allIds = Array.from(new Set([userId, ...relatedUserIds]));
  if (allIds.length === 0) return;
  await prisma.user.updateMany({
    where: { id: { in: allIds } },
    data: { hasSharedLoginRisk: true },
  });
}

async function logFailedLoginAttempt(params: {
  usernameInput: string;
  ipAddress: string;
  userAgent: string;
  deviceKey: string;
  blockedReason?: string;
  failedReason?: string;
  userId?: string;
  isSharedIp?: boolean;
  isSharedDevice?: boolean;
}) {
  await prisma.loginAccessLog.create({
    data: {
      userId: params.userId,
      usernameInput: params.usernameInput,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceKey: params.deviceKey,
      success: false,
      blockedReason: params.blockedReason,
      failedReason: params.failedReason,
      isSharedIp: Boolean(params.isSharedIp),
      isSharedDevice: Boolean(params.isSharedDevice),
    },
  });
}

async function logConflictEvents(
  userId: string,
  relatedUserIds: string[],
  conflictType: LoginConflictType,
  ipAddress: string,
  deviceKey: string,
  occurredDate: string,
) {
  const uniqueRelated = Array.from(new Set(relatedUserIds.filter((id) => id && id !== userId)));
  if (uniqueRelated.length === 0) return;

  const rows = uniqueRelated.flatMap((relatedUserId) => [
    {
      userId,
      conflictWithUserId: relatedUserId,
      conflictType,
      ipAddress,
      deviceKey,
      occurredDate,
    },
    {
      userId: relatedUserId,
      conflictWithUserId: userId,
      conflictType,
      ipAddress,
      deviceKey,
      occurredDate,
    },
  ]);

  try {
    await prisma.loginConflictEvent.createMany({ data: rows });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "P2021") throw error;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid payload", 400, parsed.error.flatten());
  }
  const deviceKey = getDeviceKey(userAgent, parsed.data.clientDevice);
  const securityConfig = await getLoginSecurityConfig();

  const limit = await consumeLoginAttempt(ip, parsed.data.username);
  if (!limit.allowed) {
    await logFailedLoginAttempt({
      usernameInput: parsed.data.username,
      ipAddress: ip,
      userAgent,
      deviceKey,
      blockedReason: "TOO_MANY_ATTEMPTS",
    });
    return fail("Too many login attempts", 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }

  if (securityConfig.blockMobilePhoneLogin && isMobilePhoneRequest(request, userAgent, parsed.data.clientDevice)) {
    await logFailedLoginAttempt({
      usernameInput: parsed.data.username,
      ipAddress: ip,
      userAgent,
      deviceKey,
      blockedReason: "MOBILE_DEVICE_BLOCKED",
    });
    return fail("Không cho phép đăng nhập từ điện thoại", 403);
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (!user || !user.isActive) {
    await logFailedLoginAttempt({
      usernameInput: parsed.data.username,
      ipAddress: ip,
      userAgent,
      deviceKey,
      failedReason: "INVALID_CREDENTIALS",
    });
    return fail("Invalid credentials", 401);
  }

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await logFailedLoginAttempt({
      usernameInput: parsed.data.username,
      ipAddress: ip,
      userAgent,
      deviceKey,
      failedReason: "INVALID_CREDENTIALS",
    });
    return fail("Invalid credentials", 401);
  }

  const now = new Date();
  const todayVn = vnDateString(now);
  const todayStart = parseWorkDateToUtc(todayVn);
  const activeSessionWindowMinutesRaw = Number(process.env.SINGLE_DEVICE_ACTIVE_WINDOW_MINUTES ?? "30");
  const activeSessionWindowMinutes = Number.isFinite(activeSessionWindowMinutesRaw) && activeSessionWindowMinutesRaw > 0 ? activeSessionWindowMinutesRaw : 30;
  const activeSessionCutoff = new Date(now.getTime() - activeSessionWindowMinutes * 60 * 1000);

  if (Math.random() < 0.05) {
    await prisma.authSession.deleteMany({ where: { expiresAt: { lte: now } } });
  }

  if (securityConfig.enforceSingleDevicePerAccount) {
    await prisma.authSession.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lt: activeSessionCutoff } }],
      },
    });

    const otherDeviceSession = await prisma.authSession.findFirst({
      where: {
        userId: user.id,
        expiresAt: { gt: now },
        lastSeenAt: { gte: activeSessionCutoff },
        deviceKey: { not: deviceKey },
      },
      select: { id: true },
    });
    if (otherDeviceSession) {
      await logFailedLoginAttempt({
        userId: user.id,
        usernameInput: parsed.data.username,
        ipAddress: ip,
        userAgent,
        deviceKey,
        blockedReason: "ACCOUNT_ACTIVE_ON_OTHER_DEVICE",
      });
      return fail("Tài khoản đang đăng nhập trên thiết bị khác", 409);
    }
  }

  if (securityConfig.enforceSingleAccountPerDeviceIp) {
    const recentConflict = await prisma.loginAccessLog.findFirst({
      where: {
        success: true,
        userId: { not: user.id },
        OR: [{ ipAddress: ip, createdAt: { gte: todayStart } }, { deviceKey }],
      },
      select: { userId: true, ipAddress: true, deviceKey: true },
    });

    if (recentConflict) {
      const sameIp = recentConflict.ipAddress === ip;
      const sameDevice = recentConflict.deviceKey === deviceKey;
      const relatedUserIds = recentConflict.userId ? [recentConflict.userId] : [];
      await logFailedLoginAttempt({
        userId: user.id,
        usernameInput: parsed.data.username,
        ipAddress: ip,
        userAgent,
        deviceKey,
        blockedReason: "DEVICE_OR_IP_LOCKED_TODAY",
        isSharedIp: sameIp,
        isSharedDevice: sameDevice,
      });
      await Promise.all([
        sameIp ? logConflictEvents(user.id, relatedUserIds, LoginConflictType.IP, ip, deviceKey, todayVn) : Promise.resolve(),
        sameDevice ? logConflictEvents(user.id, relatedUserIds, LoginConflictType.DEVICE, ip, deviceKey, todayVn) : Promise.resolve(),
        markSharedRisk(user.id, relatedUserIds),
      ]);
      return fail("Thiết bị này hoặc IP trong ngày đã đăng nhập tài khoản khác", 409);
    }
  }

  const [sharedIpRows, sharedDeviceRows] = await Promise.all([
    prisma.loginAccessLog.findMany({
      where: { success: true, ipAddress: ip, userId: { not: user.id }, createdAt: { gte: todayStart } },
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

  const allSharedIds = [...sharedIpUserIds, ...sharedDeviceUserIds];
  await Promise.all([
    allSharedIds.length > 0 ? markSharedRisk(user.id, allSharedIds) : Promise.resolve(),
    isSharedIp ? logConflictEvents(user.id, sharedIpUserIds, LoginConflictType.IP, ip, deviceKey, todayVn) : Promise.resolve(),
    isSharedDevice ? logConflictEvents(user.id, sharedDeviceUserIds, LoginConflictType.DEVICE, ip, deviceKey, todayVn) : Promise.resolve(),
  ]);

  if (securityConfig.enforceSingleDevicePerAccount) {
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
  }

  const rememberMe = parsed.data.rememberMe === true;
  const token = await createSession(user.id, {
    ipAddress: ip,
    userAgent,
    deviceKey,
    isSharedIp,
    isSharedDevice,
    rememberMe,
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

  const sessionDays = rememberMe ? SESSION_DAYS : 1;
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000)));
  response.cookies.set(CSRF_COOKIE, createCsrfToken(), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
