import { NextRequest } from "next/server";
import { Role, WorkMode } from "@prisma/client";
import * as XLSX from "xlsx";
import { fail, ok } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRoleRequest } from "@/lib/rbac";

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] as const;

const ROLE_ALIASES: Record<string, string> = {
  "SUPER_ADMIN": "SUPER_ADMIN",
  "ADMIN": "ADMIN",
  "EMPLOYEE": "EMPLOYEE",
  "SIÊU QUẢN TRỊ": "SUPER_ADMIN",
  "QUẢN TRỊ VIÊN": "ADMIN",
  "QUẢN TRỊ": "ADMIN",
  "NHÂN VIÊN": "EMPLOYEE",
};

const WORKMODE_ALIASES: Record<string, WorkMode> = {
  "ONLINE": WorkMode.ONLINE,
  "OFFLINE": WorkMode.OFFLINE,
  "TRỰC TUYẾN": WorkMode.ONLINE,
  "TRỰC TIẾP": WorkMode.OFFLINE,
};

const ACTIVE_ALIASES: Record<string, boolean> = {
  "TRUE": true, "FALSE": false,
  "1": true, "0": false,
  "HOẠT ĐỘNG": true, "NGƯNG": false,
  "ĐANG LÀM": true, "NGHỈ VIỆC": false,
  "CÒN LÀM": true, "ĐÃ NGHỈ": false,
  "ACTIVE": true, "INACTIVE": false,
};

// POST /api/admin/users/import - preview or commit import
export async function POST(request: NextRequest) {
  const user = await requireRoleRequest(request, [Role.ADMIN, Role.SUPER_ADMIN]);
  if (!user) return fail("Unauthorized", 401);
  if (!validateCsrf(request)) return fail("Invalid CSRF token", 403);

  const formData = await request.formData().catch(() => null);
  if (!formData) return fail("Invalid form data", 400);

  const file = formData.get("file") as File | null;
  const mode = formData.get("mode") as string | null; // "preview" or "commit"
  if (!file) return fail("File is required", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return fail("File trống", 400);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rawRows.length === 0) return fail("File không có dữ liệu", 400);
  if (rawRows.length > 500) return fail("Tối đa 500 nhân viên", 400);

  const cols = Object.keys(rawRows[0]);
  const findCol = (patterns: string[]) => cols.find((c) => patterns.some((p) => c.toLowerCase().includes(p))) ?? null;

  const usernameCol = findCol(["username", "tên đăng nhập", "ma_nv", "mã nv"]);
  const fullNameCol = findCol(["fullname", "full_name", "họ tên", "ho_ten", "tên", "name"]);
  const passwordCol = findCol(["password", "mật khẩu", "mat_khau"]);
  const roleCol = findCol(["role", "vai trò", "vai_tro"]);
  const departmentCol = findCol(["department", "chức vụ", "phòng ban", "phong_ban"]);
  const emailCol = findCol(["email"]);
  const phoneCol = findCol(["phone", "điện thoại", "sdt", "số điện thoại"]);
  const shiftCol = findCol(["shift", "ca", "ca làm", "ca làm việc", "ca_lam_viec"]);
  const workStartCol = findCol(["giờ vào", "gio_vao", "workstarttime", "work_start_time", "start_time"]);
  const workEndCol = findCol(["giờ ra", "gio_ra", "workendtime", "work_end_time", "end_time"]);
  const lateGraceCol = findCol(["phút trễ", "phut_tre", "lategraceminutes", "late_grace"]);
  const earlyLeaveCol = findCol(["phút về sớm", "phut_ve_som", "earlyleavegraceminutes", "early_leave_grace"]);
  const statusCol = findCol(["trạng thái", "trang_thai", "status", "isactive"]);
  const workModeCol = findCol(["hình thức", "hinh_thuc", "workmode", "work_mode"]);
  const offDaysCol = findCol(["nghỉ/tháng", "nghi_thang", "allowedoffdayspermonth", "allowed_off", "off_days"]);

  if (!usernameCol || !fullNameCol) {
    return fail(`Cần cột: username/mã NV và fullName/họ tên. Các cột: ${cols.join(", ")}`, 400);
  }

  const existingUsers = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, role: true },
  });
  const existingUserMap = new Map(existingUsers.map((u) => [u.username, u]));

  // Load active shifts for matching by name
  const activeShifts = await prisma.shift.findMany({ where: { isActive: true } });
  const shiftByName = new Map(activeShifts.map((s) => [s.name.toLowerCase().trim(), s]));

  type PreviewRow = {
    row: number;
    username: string;
    fullName: string;
    role: string;
    department: string;
    shift: string;
    status: string;
    workMode: string;
    lateGrace: string;
    earlyLeaveGrace: string;
    offDays: string;
    action?: string;
    error?: string;
  };

  const previews: PreviewRow[] = [];
  const toCreate: Array<{
    username: string;
    fullName: string;
    passwordHash: string;
    role: Role;
    department: string | null;
    email: string | null;
    phone: string | null;
    workStartTime: string | null;
    workEndTime: string | null;
    shiftId: string | null;
    lateGraceMinutes: number;
    earlyLeaveGraceMinutes: number;
    isActive: boolean;
    workMode: WorkMode;
    allowedOffDaysPerMonth: number;
  }> = [];

  const toUpdate: Array<{
    existingUserId: string;
    fullName: string;
    passwordHash: string | null;
    role: Role;
    department: string | null;
    email: string | null;
    phone: string | null;
    workStartTime: string | null;
    workEndTime: string | null;
    shiftId: string | null;
    lateGraceMinutes: number;
    earlyLeaveGraceMinutes: number;
    isActive: boolean;
    workMode: WorkMode;
    allowedOffDaysPerMonth: number;
  }> = [];

  const seenUsernames = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const username = String(raw[usernameCol] ?? "").trim();
    const fullName = String(raw[fullNameCol] ?? "").trim();
    const password = passwordCol ? String(raw[passwordCol] ?? "").trim() : "";
    const roleStr = roleCol ? String(raw[roleCol] ?? "").trim().toUpperCase() : "EMPLOYEE";
    const normalizedRole = ROLE_ALIASES[roleStr] ?? roleStr;
    const department = departmentCol ? String(raw[departmentCol] ?? "").trim() : "";
    const email = emailCol ? String(raw[emailCol] ?? "").trim() : "";
    const phone = phoneCol ? String(raw[phoneCol] ?? "").trim() : "";
    const shiftName = shiftCol ? String(raw[shiftCol] ?? "").trim() : "";
    const workStartTime = workStartCol ? String(raw[workStartCol] ?? "").trim() : "";
    const workEndTime = workEndCol ? String(raw[workEndCol] ?? "").trim() : "";
    const lateGraceStr = lateGraceCol ? String(raw[lateGraceCol] ?? "").trim() : "";
    const earlyLeaveStr = earlyLeaveCol ? String(raw[earlyLeaveCol] ?? "").trim() : "";
    const statusStr = statusCol ? String(raw[statusCol] ?? "").trim().toUpperCase() : "";
    const workModeStr = workModeCol ? String(raw[workModeCol] ?? "").trim().toUpperCase() : "";
    const offDaysStr = offDaysCol ? String(raw[offDaysCol] ?? "").trim() : "";

    const matchedShift = shiftName ? shiftByName.get(shiftName.toLowerCase()) ?? null : null;

    // Parse numeric fields with defaults
    const lateGraceMinutes = lateGraceStr ? parseInt(lateGraceStr, 10) : 5;
    const earlyLeaveGraceMinutes = earlyLeaveStr ? parseInt(earlyLeaveStr, 10) : 5;
    const allowedOffDaysPerMonth = offDaysStr ? parseInt(offDaysStr, 10) : 2;
    const isActive = statusStr ? (ACTIVE_ALIASES[statusStr] ?? true) : true;
    const workMode = workModeStr ? (WORKMODE_ALIASES[workModeStr] ?? WorkMode.OFFLINE) : WorkMode.OFFLINE;

    const preview: PreviewRow = {
      row: i + 2, username, fullName, role: normalizedRole, department, shift: shiftName,
      status: isActive ? "Hoạt động" : "Ngưng",
      workMode: workMode === WorkMode.ONLINE ? "Online" : "Offline",
      lateGrace: String(lateGraceMinutes),
      earlyLeaveGrace: String(earlyLeaveGraceMinutes),
      offDays: String(allowedOffDaysPerMonth),
    };

    if (!username || username.length < 2) { preview.error = "Username quá ngắn"; previews.push(preview); continue; }
    if (!fullName) { preview.error = "Thiếu họ tên"; previews.push(preview); continue; }
    if (seenUsernames.has(username)) { preview.error = "Username trùng trong file"; previews.push(preview); continue; }
    if (lateGraceStr && (isNaN(lateGraceMinutes) || lateGraceMinutes < 0 || lateGraceMinutes > 180)) { preview.error = "Phút trễ không hợp lệ (0-180)"; previews.push(preview); continue; }
    if (earlyLeaveStr && (isNaN(earlyLeaveGraceMinutes) || earlyLeaveGraceMinutes < 0 || earlyLeaveGraceMinutes > 180)) { preview.error = "Phút về sớm không hợp lệ (0-180)"; previews.push(preview); continue; }
    if (offDaysStr && (isNaN(allowedOffDaysPerMonth) || allowedOffDaysPerMonth < 0 || allowedOffDaysPerMonth > 31)) { preview.error = "Ngày nghỉ/tháng không hợp lệ (0-31)"; previews.push(preview); continue; }

    const existingUser = existingUserMap.get(username) ?? null;
    const isExisting = Boolean(existingUser);

    // For new users: password required (default = username). For existing: only hash if provided.
    const finalPassword = password || (isExisting ? "" : username);
    if (!isExisting && finalPassword.length < 6) { preview.error = "Mật khẩu quá ngắn (tối thiểu 6 ký tự)"; previews.push(preview); continue; }
    if (isExisting && password && password.length < 6) { preview.error = "Mật khẩu quá ngắn (tối thiểu 6 ký tự)"; previews.push(preview); continue; }
    if (shiftName && !matchedShift) { preview.error = `Không tìm thấy ca "${shiftName}"`; previews.push(preview); continue; }

    const role = VALID_ROLES.includes(normalizedRole as typeof VALID_ROLES[number]) ? (normalizedRole as Role) : Role.EMPLOYEE;
    // Non-super admins cannot create or modify SUPER_ADMIN records
    if (role === Role.SUPER_ADMIN && user.role !== "SUPER_ADMIN") {
      preview.error = "Không có quyền tạo SUPER_ADMIN"; previews.push(preview); continue;
    }
    if (existingUser?.role === Role.SUPER_ADMIN && user.role !== "SUPER_ADMIN") {
      preview.error = "Không có quyền cập nhật SUPER_ADMIN"; previews.push(preview); continue;
    }

    seenUsernames.add(username);
    preview.action = isExisting ? "Cập nhật" : "Tạo mới";
    previews.push(preview);

    if (isExisting) {
      toUpdate.push({
        existingUserId: existingUser!.id,
        fullName,
        passwordHash: password ? await hashPassword(password) : null,
        role,
        department: department || null,
        email: email || null,
        phone: phone || null,
        workStartTime: workStartTime || null,
        workEndTime: workEndTime || null,
        shiftId: matchedShift?.id ?? null,
        lateGraceMinutes,
        earlyLeaveGraceMinutes,
        isActive,
        workMode,
        allowedOffDaysPerMonth,
      });
    } else {
      toCreate.push({
        username,
        fullName,
        passwordHash: await hashPassword(finalPassword),
        role,
        department: department || null,
        email: email || null,
        phone: phone || null,
        workStartTime: workStartTime || null,
        workEndTime: workEndTime || null,
        shiftId: matchedShift?.id ?? null,
        lateGraceMinutes,
        earlyLeaveGraceMinutes,
        isActive,
        workMode,
        allowedOffDaysPerMonth,
      });
    }
  }

  const valid = previews.filter((p) => !p.error).length;
  const invalid = previews.filter((p) => p.error).length;

  if (mode !== "commit") {
    return ok({ mode: "preview", valid, invalid, total: rawRows.length, previews, columns: cols });
  }

  // Commit: create/update users
  if (toCreate.length === 0 && toUpdate.length === 0) return fail("Không có nhân viên hợp lệ để import", 400);

  const now = new Date();
  const { created, updated } = await prisma.$transaction(async (tx) => {
    let created = 0;
    for (const userData of toCreate) {
      const { shiftId, ...userFields } = userData;
      const newUser = await tx.user.create({ data: userFields });
      if (shiftId) {
        await tx.employeeShiftAssignment.create({
          data: {
            userId: newUser.id,
            shiftId,
            effectiveFrom: now,
          },
        });
      }
      created++;
    }

    let updated = 0;
    for (const userData of toUpdate) {
      const { existingUserId, shiftId, passwordHash, ...fields } = userData;
      const updateData: Record<string, unknown> = { ...fields };
      if (passwordHash) updateData.passwordHash = passwordHash;

      await tx.user.update({ where: { id: existingUserId }, data: updateData });

      if (shiftId) {
        await tx.employeeShiftAssignment.updateMany({
          where: { userId: existingUserId, effectiveTo: null },
          data: { effectiveTo: now },
        });
        await tx.employeeShiftAssignment.create({
          data: {
            userId: existingUserId,
            shiftId,
            effectiveFrom: now,
          },
        });
      }
      updated++;
    }

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "IMPORT_USERS",
        entityType: "User",
        entityId: "bulk",
        afterJson: JSON.stringify({ created, updated, total: rawRows.length }),
      },
    });

    return { created, updated };
  });

  return ok({ mode: "commit", created, updated, total: rawRows.length });
}
