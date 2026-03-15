import { prisma } from "@/lib/prisma";
import { LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS } from "@/lib/constants";

const apiRateLimitStore = new Map<string, { count: number; resetAt: number }>();
const API_RATE_WINDOW_MS = 60_000;
const API_RATE_MAX = 60;
const API_RATE_MAX_ENTRIES = 10_000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000; // Sweep expired entries every 5 minutes

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of apiRateLimitStore) {
    if (now >= entry.resetAt) apiRateLimitStore.delete(key);
  }
}

export function consumeApiRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  cleanupExpiredEntries();

  // Evict oldest entries if store grows too large to prevent memory leak
  if (apiRateLimitStore.size >= API_RATE_MAX_ENTRIES) {
    const iter = apiRateLimitStore.keys();
    for (let i = 0; i < 1000; i++) {
      const k = iter.next();
      if (k.done) break;
      apiRateLimitStore.delete(k.value);
    }
  }

  const entry = apiRateLimitStore.get(key);
  if (!entry || now >= entry.resetAt) {
    apiRateLimitStore.set(key, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > API_RATE_MAX) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export async function consumeLoginAttempt(ipAddress: string, usernameInput: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);
  const where = {
    ipAddress,
    usernameInput,
    success: false,
    createdAt: { gte: windowStart },
  };

  // Single query: get oldest failed attempt and count in one pass
  const firstAttempt = await prisma.loginAccessLog.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (!firstAttempt) return { allowed: true };

  const attemptCount = await prisma.loginAccessLog.count({ where });

  if (attemptCount >= LOGIN_MAX_ATTEMPTS) {
    const elapsedMs = Date.now() - firstAttempt.createdAt.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - elapsedMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}
