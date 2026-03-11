import { NextRequest } from "next/server";
import { Role, AttendanceStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { fail, ok } from "@/lib/api";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";
import { isValidDate } from "@/lib/time";

type ImportRow = {
  row: number;
  username: string;
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  error?: string;
};

function parseExcelTime(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    // Excel serial time (fraction of day)
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const str = String(val).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str.slice(0, 5);
  return null;
}

function parseExcelDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    // Excel date serial number
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  const str = String(val).trim();
  // Support DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // Support YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

// POST /api/admin/attendance/import - import attendance from CSV/Excel
export async function POST(request: NextRequest) {
  const user = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) return fail("Unauthorized", 401);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const formData = await request.formData().catch(() => null);
  if (!formData) return fail("Invalid form data", 400);

  const file = formData.get("file") as File | null;
  if (!file) return fail("File is required", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return fail("File trống", 400);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rawRows.length === 0) return fail("File không có dữ liệu", 400);
  if (rawRows.length > 5000) return fail("Tối đa 5000 dòng", 400);

  // Auto-detect column names
  const firstRow = rawRows[0];
  const cols = Object.keys(firstRow);
  const findCol = (patterns: string[]) => cols.find((c) => patterns.some((p) => c.toLowerCase().includes(p))) ?? null;

  const usernameCol = findCol(["username", "tên đăng nhập", "ma_nv", "mã nv", "mã nhân viên", "employee_id"]);
  const dateCol = findCol(["date", "ngày", "ngay", "work_date", "workdate"]);
  const checkInCol = findCol(["check_in", "checkin", "giờ vào", "gio_vao", "lên ca", "len_ca", "in"]);
  const checkOutCol = findCol(["check_out", "checkout", "giờ ra", "gio_ra", "xuống ca", "xuong_ca", "out"]);

  if (!usernameCol || !dateCol) {
    return fail(`Không tìm thấy cột bắt buộc. Cần: username/mã NV và date/ngày. Các cột trong file: ${cols.join(", ")}`, 400);
  }

  // Map usernames to user IDs
  const allUsernames = [...new Set(rawRows.map((r) => String(r[usernameCol] ?? "").trim()).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { username: { in: allUsernames }, deletedAt: null },
    select: { id: true, username: true },
  });
  const userMap = new Map(users.map((u) => [u.username, u.id]));

  const results: ImportRow[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const username = String(raw[usernameCol] ?? "").trim();
    const workDate = parseExcelDate(raw[dateCol]);
    const checkInTime = checkInCol ? parseExcelTime(raw[checkInCol]) : null;
    const checkOutTime = checkOutCol ? parseExcelTime(raw[checkOutCol]) : null;

    const row: ImportRow = { row: i + 2, username, workDate: workDate ?? "", checkIn: checkInTime, checkOut: checkOutTime };

    if (!username) { row.error = "Thiếu username"; skipped++; results.push(row); continue; }
    if (!workDate || !isValidDate(workDate)) { row.error = "Ngày không hợp lệ"; skipped++; results.push(row); continue; }

    const userId = userMap.get(username);
    if (!userId) { row.error = "Không tìm thấy nhân viên"; skipped++; results.push(row); continue; }

    const checkInAt = checkInTime ? new Date(`${workDate}T${checkInTime}:00.000+07:00`) : null;
    const checkOutAt = checkOutTime ? new Date(`${workDate}T${checkOutTime}:00.000+07:00`) : null;

    // Handle overnight: if checkOut time < checkIn time, add 1 day
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
      checkOutAt.setDate(checkOutAt.getDate() + 1);
    }

    let workedMinutes: number | null = null;
    if (checkInAt && checkOutAt) {
      workedMinutes = Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
    }

    let status: AttendanceStatus = AttendanceStatus.INCOMPLETE;
    if (checkInAt && checkOutAt) status = AttendanceStatus.PRESENT;
    else if (!checkInAt && !checkOutAt) status = AttendanceStatus.ABSENT;

    await prisma.attendanceDay.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, checkInAt, checkOutAt, status, workedMinutes },
      update: { checkInAt, checkOutAt, status, workedMinutes },
    });

    imported++;
    results.push(row);
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "IMPORT_ATTENDANCE",
      entityType: "AttendanceDay",
      entityId: "bulk",
      afterJson: JSON.stringify({ imported, skipped, total: rawRows.length }),
    },
  });

  return ok({ imported, skipped, total: rawRows.length, results: results.filter((r) => r.error) });
}
