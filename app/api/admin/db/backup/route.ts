import fs from "node:fs";
import path from "node:path";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { requireRoleRequest } from "@/lib/rbac";

const MAX_BACKUPS = 7;

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pruneOldBackups(backupDir: string) {
  if (!fs.existsSync(backupDir)) return;
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(backupDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(backupDir, file.name));
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) return fail("Không tìm thấy file database", 400);

  const backupDir = path.join(process.cwd(), "backups", "auto");
  fs.mkdirSync(backupDir, { recursive: true });

  const backupName = `db-backup-${nowStamp()}.db`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(dbPath, backupPath);

  pruneOldBackups(backupDir);

  return ok({
    message: "Backup thành công",
    backupPath: `backups/auto/${backupName}`,
    backedUpBy: actor.username,
    backedUpAt: new Date().toISOString(),
  });
}
