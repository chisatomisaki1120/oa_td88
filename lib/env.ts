/** Validate required environment variables at startup */
export function validateEnv() {
  if (!process.env.DATABASE_URL) {
    console.warn("[env] DATABASE_URL not set, using default file:./prisma/dev.db");
  }
}
