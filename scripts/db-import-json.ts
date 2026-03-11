import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type DbObject = {
  type: string;
  name: string;
  tableName: string;
  sql: string;
};

type ImportPayload = {
  schema: DbObject[];
  data: Record<string, Array<Record<string, unknown>>>;
};

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createSafetyBackup(dbPath: string) {
  if (!fs.existsSync(dbPath)) return;
  const backupDir = path.join(process.cwd(), "backups", "before-import");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `db-before-import-${nowStamp()}.db`);
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Created safety backup at ${backupPath}`);
}

function insertRows(db: Database.Database, tableName: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return;

  const columnSql = columns.map((c) => `"${c}"`).join(", ");
  const valueSql = columns.map((c) => `@${c}`).join(", ");
  const statement = db.prepare(`INSERT INTO "${tableName}" (${columnSql}) VALUES (${valueSql})`);

  for (const row of rows) {
    statement.run(row);
  }
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run db:import:json -- <path-to-json>");
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input file does not exist: ${resolvedInput}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedInput, "utf8")) as ImportPayload;
  if (!parsed || !Array.isArray(parsed.schema) || typeof parsed.data !== "object") {
    throw new Error("Invalid JSON format. Expected fields: schema[] and data{}");
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  createSafetyBackup(dbPath);

  const db = new Database(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN;");

    const existingTables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>;
    for (const table of existingTables) {
      db.exec(`DROP TABLE IF EXISTS "${table.name}";`);
    }

    const tableSchema = parsed.schema.filter((o) => o.type === "table");
    const otherSchema = parsed.schema.filter((o) => o.type !== "table");

    for (const item of tableSchema) {
      db.exec(item.sql);
    }

    for (const item of tableSchema) {
      insertRows(db, item.name, parsed.data[item.name] ?? []);
    }

    for (const item of otherSchema) {
      db.exec(item.sql);
    }

    db.exec("COMMIT;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch (error) {
    db.exec("ROLLBACK;");
    db.exec("PRAGMA foreign_keys = ON;");
    throw error;
  } finally {
    db.close();
  }

  // Sync schema: add any columns missing from the old backup
  try {
    execSync("npx prisma db push --accept-data-loss --config prisma.config.ts", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    console.log("Schema synced with current Prisma schema.");
  } catch {
    console.warn("Warning: could not sync schema. Run 'npx prisma db push --config prisma.config.ts' manually.");
  }

  // Migrate old WC_SMOKE data to separate WC/SMOKE if present
  try {
    const migrateDb = new Database(dbPath);
    const hasOld = migrateDb.prepare("SELECT 1 FROM BreakSession WHERE breakType = 'WC_SMOKE' LIMIT 1").get();
    if (hasOld) {
      const r = migrateDb.prepare("UPDATE BreakSession SET breakType = 'WC' WHERE breakType = 'WC_SMOKE'").run();
      console.log(`Migrated ${r.changes} WC_SMOKE → WC break sessions`);
    }
    const r2 = migrateDb.prepare("UPDATE User SET breakPolicyJson = REPLACE(breakPolicyJson, '\"wcSmoke\"', '\"wc\"') WHERE breakPolicyJson LIKE '%\"wcSmoke\"%'").run();
    const r3 = migrateDb.prepare("UPDATE Shift SET breakPolicyJson = REPLACE(breakPolicyJson, '\"wcSmoke\"', '\"wc\"') WHERE breakPolicyJson LIKE '%\"wcSmoke\"%'").run();
    if (r2.changes || r3.changes) console.log(`Migrated breakPolicyJson: ${r2.changes} users, ${r3.changes} shifts`);
    migrateDb.close();
  } catch (err) {
    console.warn("Warning: WC_SMOKE migration failed:", err instanceof Error ? err.message : err);
  }

  console.log(`Imported database JSON from ${resolvedInput}`);
}

main();
