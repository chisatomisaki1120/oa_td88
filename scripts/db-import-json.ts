import "dotenv/config";
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

  console.log(`Imported database JSON from ${resolvedInput}`);
}

main();
