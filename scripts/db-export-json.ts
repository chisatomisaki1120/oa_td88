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

type ExportPayload = {
  meta: {
    exportedAt: string;
    databasePath: string;
  };
  schema: DbObject[];
  data: Record<string, Array<Record<string, unknown>>>;
};

const SKIP_TABLES = new Set(["LoginAccessLog", "AuthSession", "AuditLog"]);

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(process.cwd(), "backups", "json", `db-export-${timestamp}.json`);
}

function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database does not exist: ${dbPath}`);
  }

  const outputFile = path.resolve(process.cwd(), process.argv[2] ?? defaultOutputPath());
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const schemaRows = db
    .prepare(
      `SELECT type, name, tbl_name as tableName, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       AND sql IS NOT NULL
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
    )
    .all() as Array<DbObject>;

  const tableNames = schemaRows.filter((row) => row.type === "table" && !SKIP_TABLES.has(row.name)).map((row) => row.name);
  const filteredSchema = schemaRows.filter((row) => !SKIP_TABLES.has(row.tableName));

  const data: ExportPayload["data"] = {};
  for (const tableName of tableNames) {
    const rows = db.prepare(`SELECT * FROM "${tableName}"`).all() as Array<Record<string, unknown>>;
    data[tableName] = rows;
  }
  db.close();

  const payload: ExportPayload = {
    meta: {
      exportedAt: new Date().toISOString(),
      databasePath: dbPath,
    },
    schema: filteredSchema,
    data,
  };

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Exported database JSON to ${outputFile}`);
}

main();
