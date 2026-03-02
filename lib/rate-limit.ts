const attempts = new Map<string, { count: number; firstAt: number }>();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function consumeLoginAttempt(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || now - current.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return { allowed: true };
  }

  if (current.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - current.firstAt)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  current.count += 1;
  attempts.set(key, current);
  return { allowed: true };
}
