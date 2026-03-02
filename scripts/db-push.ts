import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const sql = execSync(`npx prisma migrate diff --from-empty --to-schema "${schemaPath}" --script`, {
  encoding: "utf8",
});

const force = process.argv.includes("--force");
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const dbPath = databaseUrl.replace(/^file:/, "");
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(root, dbPath);
fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

if (!force && fs.existsSync(resolvedDbPath)) {
  const existingDb = new Database(resolvedDbPath, { readonly: true });
  const existingTables = existingDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  existingDb.close();

  if (existingTables.length > 0) {
    console.log(`Database already exists at ${resolvedDbPath}. Keeping existing data.`);
    process.exit(0);
  }
}

const db = new Database(resolvedDbPath);
db.exec("PRAGMA foreign_keys = OFF;");
const existingTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all() as Array<{ name: string }>;
for (const table of existingTables) {
  db.exec(`DROP TABLE IF EXISTS "${table.name}";`);
}
db.exec(sql);
db.exec("PRAGMA foreign_keys = ON;");
db.close();

console.log(`Database schema initialized at ${resolvedDbPath}`);
