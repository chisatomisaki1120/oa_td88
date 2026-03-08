import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { requireRoleRequest } from "@/lib/rbac";
import { resolveDbPath, getBackupDir } from "../route";

export async function POST(request: NextRequest) {
  const actor = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!actor) return fail("Forbidden", 403);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const formData = await request.formData().catch(() => null);
  if (!formData) return fail("Dữ liệu không hợp lệ", 400);

  const dbPath = resolveDbPath();

  // Determine restore source: uploaded file or selected backup name
  const uploadedFile = formData.get("file");
  const backupName = formData.get("backupName");

  let sourceBuffer: Buffer;

  if (uploadedFile instanceof File) {
    // Restore from uploaded .db file
    if (!uploadedFile.name.endsWith(".db")) {
      return fail("Chỉ chấp nhận file .db", 400);
    }
    const arrayBuffer = await uploadedFile.arrayBuffer();
    sourceBuffer = Buffer.from(arrayBuffer);

    // Basic SQLite header validation
    if (sourceBuffer.length < 16 || sourceBuffer.toString("utf8", 0, 15) !== "SQLite format 3") {
      return fail("File không phải database SQLite hợp lệ", 400);
    }
  } else if (typeof backupName === "string" && backupName) {
    // Restore from existing backup in backups/auto/
    const safeName = path.basename(backupName);
    if (safeName !== backupName || !safeName.endsWith(".db")) {
      return fail("Tên file backup không hợp lệ", 400);
    }
    const backupPath = path.join(getBackupDir(), safeName);
    if (!fs.existsSync(backupPath)) {
      return fail("File backup không tồn tại", 404);
    }
    sourceBuffer = fs.readFileSync(backupPath);
  } else {
    return fail("Cần upload file .db hoặc chọn backup từ danh sách", 400);
  }

  // Create safety backup before restoring
  const safetyDir = path.join(process.cwd(), "backups", "before-import");
  fs.mkdirSync(safetyDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, path.join(safetyDir, `db-before-restore-${stamp}.db`));
  }

  // Overwrite database file
  fs.writeFileSync(dbPath, sourceBuffer);

  // Sync schema
  try {
    execSync("npx prisma db push --accept-data-loss --config prisma.config.ts", {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } catch {
    // non-fatal: data is already restored
  }

  return ok({
    message: "Khôi phục database thành công",
    restoredBy: actor.username,
    restoredAt: new Date().toISOString(),
  });
}
