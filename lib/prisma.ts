import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

function sqliteAdapterUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const withoutPrefix = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(withoutPrefix) ? withoutPrefix : path.resolve(process.cwd(), withoutPrefix);
}

const adapter = new PrismaBetterSqlite3({
  url: sqliteAdapterUrl(),
});

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
