import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { requireRoleRequest } from "@/lib/rbac";

type DbObject = {
  type: string;
  name: string;
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

function insertRows(db: Database.Database, tableName: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return;

  const columnSql = columns.map((c) => `"${c}"`).join(", ");
  const valueSql = columns.map((c) => `@${c}`).join(", ");
  const statement = db.prepare(`INSERT INTO "${tableName}" (${columnSql}) VALUES (${valueSql})`);
  for (const row of rows) statement.run(row);
}

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return fail("Thiếu file JSON", 400);
  }

  let parsed: ImportPayload;
  try {
    parsed = JSON.parse(await file.text()) as ImportPayload;
  } catch {
    return fail("File JSON không hợp lệ", 400);
  }

  if (!parsed || !Array.isArray(parsed.schema) || typeof parsed.data !== "object" || parsed.data === null) {
    return fail("Sai định dạng JSON. Cần có schema[] và data{}", 400);
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

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

    const tableSchema = parsed.schema.filter((o) => o.type === "table" && typeof o.sql === "string");
    const otherSchema = parsed.schema.filter((o) => o.type !== "table" && typeof o.sql === "string");

    for (const item of tableSchema) db.exec(item.sql);
    for (const item of tableSchema) insertRows(db, item.name, parsed.data[item.name] ?? []);
    for (const item of otherSchema) db.exec(item.sql);

    db.exec("COMMIT;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch (error) {
    db.exec("ROLLBACK;");
    db.exec("PRAGMA foreign_keys = ON;");
    return fail(`Import thất bại: ${error instanceof Error ? error.message : "Unknown error"}`, 400);
  } finally {
    db.close();
  }

  // Sync schema: add any columns missing from the old backup
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync("npx", ["prisma", "db", "push", "--accept-data-loss", "--config", "prisma.config.ts"], {
      cwd: process.cwd(),
    });
  } catch {
    // non-fatal: data is already imported
  }

  return ok({
    message: "Đã nhập dữ liệu DB từ JSON",
    importedBy: actor.username,
    importedAt: new Date().toISOString(),
  });
}
