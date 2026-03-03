import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api";
import { requireRoleRequest } from "@/lib/rbac";

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

export async function GET(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    return fail("Không tìm thấy database", 404);
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const schema = db
      .prepare(
        `SELECT type, name, tbl_name as tableName, sql
         FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%'
         AND sql IS NOT NULL
         ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
      )
      .all();

    const tableNames = (schema as Array<{ type: string; name: string }>).filter((row) => row.type === "table").map((row) => row.name);
    const data: Record<string, Array<Record<string, unknown>>> = {};
    for (const tableName of tableNames) {
      data[tableName] = db.prepare(`SELECT * FROM "${tableName}"`).all() as Array<Record<string, unknown>>;
    }

    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        databasePath: dbPath,
        exportedBy: actor.username,
      },
      schema,
      data,
    };

    const fileName = `db-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
      },
    });
  } finally {
    db.close();
  }
}
