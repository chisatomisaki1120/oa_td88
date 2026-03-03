import { prisma } from "@/lib/prisma";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function consumeLoginAttempt(ipAddress: string, usernameInput: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const where = {
    ipAddress,
    usernameInput,
    success: false,
    createdAt: { gte: windowStart },
  };

  const [attemptCount, firstAttempt] = await Promise.all([
    prisma.loginAccessLog.count({ where }),
    prisma.loginAccessLog.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  if (attemptCount >= MAX_ATTEMPTS && firstAttempt) {
    const elapsedMs = Date.now() - firstAttempt.createdAt.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - elapsedMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}
