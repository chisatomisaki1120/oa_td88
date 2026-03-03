type UserLike = {
  passwordHash?: string;
  [key: string]: unknown;
} | null;

export function sanitizeUserForAudit<T extends UserLike>(user: T): Omit<NonNullable<T>, "passwordHash"> | null {
  if (!user) return null;
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
}
