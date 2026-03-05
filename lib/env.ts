/** Validate required environment variables at startup */
export function validateEnv() {
  const required: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL not set, using default prisma/dev.db");
  }

  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    required.push("DATABASE_URL is required in production");
  }

  if (warnings.length > 0) {
    console.warn("[env]", warnings.join("; "));
  }

  if (required.length > 0) {
    throw new Error(`[env] Missing required environment variables: ${required.join(", ")}`);
  }
}
