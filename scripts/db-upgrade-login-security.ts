import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  return Boolean(row);
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  if (!hasTable(db, table)) return;
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`);
}

function main() {
  const resolvedDbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
  const db = new Database(resolvedDbPath);

  addColumnIfMissing(db, "User", "hasSharedLoginRisk", "BOOLEAN NOT NULL DEFAULT false");

  addColumnIfMissing(db, "AuthSession", "ipAddress", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(db, "AuthSession", "userAgent", "TEXT");
  addColumnIfMissing(db, "AuthSession", "deviceKey", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "AuthSession", "isSharedIp", "BOOLEAN NOT NULL DEFAULT false");
  addColumnIfMissing(db, "AuthSession", "isSharedDevice", "BOOLEAN NOT NULL DEFAULT false");
  addColumnIfMissing(db, "AuthSession", "lastSeenAt", "DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");

  db.exec(`
CREATE TABLE IF NOT EXISTS "LoginAccessLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "usernameInput" TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT,
  "deviceKey" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "blockedReason" TEXT,
  "failedReason" TEXT,
  "isSharedIp" BOOLEAN NOT NULL DEFAULT false,
  "isSharedDevice" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "LoginSecurityConfig" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "enforceSingleDevicePerAccount" BOOLEAN NOT NULL DEFAULT true,
  "enforceSingleAccountPerDeviceIp" BOOLEAN NOT NULL DEFAULT true,
  "blockMobilePhoneLogin" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO "LoginSecurityConfig" ("id", "enforceSingleDevicePerAccount", "enforceSingleAccountPerDeviceIp", "blockMobilePhoneLogin", "updatedAt")
VALUES (1, true, true, true, CURRENT_TIMESTAMP);
`);

  if (hasTable(db, "AuthSession")) {
    db.exec(`CREATE INDEX IF NOT EXISTS "AuthSession_deviceKey_idx" ON "AuthSession"("deviceKey");`);
    db.exec(`CREATE INDEX IF NOT EXISTS "AuthSession_ipAddress_idx" ON "AuthSession"("ipAddress");`);
  }
  if (hasTable(db, "LoginAccessLog")) {
    db.exec(`CREATE INDEX IF NOT EXISTS "LoginAccessLog_userId_idx" ON "LoginAccessLog"("userId");`);
    db.exec(`CREATE INDEX IF NOT EXISTS "LoginAccessLog_ipAddress_createdAt_idx" ON "LoginAccessLog"("ipAddress", "createdAt");`);
    db.exec(`CREATE INDEX IF NOT EXISTS "LoginAccessLog_deviceKey_createdAt_idx" ON "LoginAccessLog"("deviceKey", "createdAt");`);
    db.exec(`CREATE INDEX IF NOT EXISTS "LoginAccessLog_success_createdAt_idx" ON "LoginAccessLog"("success", "createdAt");`);
  }
  db.exec(`DROP INDEX IF EXISTS "User_username_key";`);

  db.close();
  console.log(`Upgraded login security schema at ${resolvedDbPath}`);
}

main();
