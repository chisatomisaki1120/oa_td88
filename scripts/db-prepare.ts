import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function hasExistingData(dbFile: string): boolean {
  if (!fs.existsSync(dbFile)) return false;

  const db = new Database(dbFile, { readonly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  db.close();

  return tables.length > 0;
}

const root = process.cwd();
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const dbPath = databaseUrl.replace(/^file:/, "");
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(root, dbPath);

if (hasExistingData(resolvedDbPath)) {
  console.log(`Using existing database at ${resolvedDbPath}`);
  process.exit(0);
}

console.log("Database not found or empty. Initializing...");
execSync("npm run db:generate", { stdio: "inherit" });
execSync("npm run db:push", { stdio: "inherit" });
execSync("npm run db:seed", { stdio: "inherit" });
console.log("Database ready for development.");
