"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { apiJson } from "@/lib/client-api";
import { roleLabel, workModeLabel, attendanceStatusLabel, warningLabel, parseWarnings } from "@/lib/display-labels";
import { fmtDateTime, buildMonthOptions, currentMonthVn } from "@/lib/time";
import { ErrorMessage, SuccessMessage, EmptyState } from "@/components/ui-feedback";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

type User = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  department: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  isActive: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  workMode: "ONLINE" | "OFFLINE";
  allowedOffDaysPerMonth: number;
};

type AttendanceRow = {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  isOffDay: boolean;
  isDeducted: boolean;
  offReason: string | null;
  warningFlagsJson: string | string[];
};

type Props = {
  actorRole: Role;
};

function UserDetailPanel({
  user,
  month,
  monthOptions,
  rows,
  loading,
  onChangeMonth,
}: {
  user: User;
  month: string;
  monthOptions: string[];
  rows: AttendanceRow[];
  loading: boolean;
  onChangeMonth: (m: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => a.workDate.localeCompare(b.workDate));

  // Compute warning stats
  const allWarnings: string[] = [];
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let absentCount = 0;
  let incompleteCount = 0;

  for (const r of sorted) {
    const ws = parseWarnings(r.warningFlagsJson);
    allWarnings.push(...ws);
    if (r.status === "LATE") lateCount++;
    if (r.status === "EARLY_LEAVE") earlyLeaveCount++;
    if (r.status === "ABSENT") absentCount++;
    if (r.status === "INCOMPLETE") incompleteCount++;
  }

  const warningCounts = new Map<string, number>();
  for (const w of allWarnings) {
    warningCounts.set(w, (warningCounts.get(w) ?? 0) + 1);
  }

  return (
    <div className="admin-users-inline-panel">
      <h4 style={{ marginTop: 0 }}>Chi tiết chấm công: {user.username}</h4>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={month} onChange={(e) => onChangeMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{`Tháng ${m.slice(5, 7)}/${m.slice(0, 4)}`}</option>
          ))}
        </select>
      </div>

      {/* Warning summary */}
      <div className="user-detail-summary">
        <span className="summary-item">
          <strong>Tổng ngày:</strong> {sorted.length}
        </span>
        {lateCount > 0 && (
          <span className="summary-item warning">Đi muộn: {lateCount}</span>
        )}
        {earlyLeaveCount > 0 && (
          <span className="summary-item warning">Về sớm: {earlyLeaveCount}</span>
        )}
        {absentCount > 0 && (
          <span className="summary-item danger">Vắng mặt: {absentCount}</span>
        )}
        {incompleteCount > 0 && (
          <span className="summary-item muted">Chưa đủ: {incompleteCount}</span>
        )}
        {Array.from(warningCounts.entries()).map(([w, count]) => (
          <span key={w} className="summary-item warning">{warningLabel(w)}: {count}</span>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Đang tải...</p>
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="user-detail-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Lên ca</th>
                <th>Xuống ca</th>
                <th>Làm việc</th>
                <th>Trạng thái</th>
                <th>Nghỉ</th>
                <th>Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const ws = parseWarnings(r.warningFlagsJson);
                const statusClass =
                  r.status === "LATE" || r.status === "EARLY_LEAVE"
                    ? "row-warning"
                    : r.status === "ABSENT"
                      ? "row-danger"
                      : r.status === "INCOMPLETE"
                        ? "row-muted"
                        : "";
                return (
                  <tr key={r.id} className={statusClass}>
                    <td>{r.workDate}</td>
                    <td>{r.checkInAt ? fmtDateTime(r.checkInAt) : "-"}</td>
                    <td>{r.checkOutAt ? fmtDateTime(r.checkOutAt) : "-"}</td>
                    <td>
                      {r.workedMinutes != null
                        ? `${Math.floor(r.workedMinutes / 60)}h${r.workedMinutes % 60 > 0 ? (r.workedMinutes % 60) + "p" : ""}`
                        : "-"}
                    </td>
                    <td>{attendanceStatusLabel(r.status, !!r.checkOutAt)}</td>
                    <td>{r.isOffDay ? (r.isDeducted ? "Không phép" : "Có phép") : "-"}</td>
                    <td>
                      {ws.length > 0 ? ws.map((w) => warningLabel(w)).join(", ") : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminUsers({ actorRole }: Props) {
  const canAssignSuperAdmin = actorRole === "SUPER_ADMIN";

  const [rows, setRows] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "EMPLOYEE",
    department: "",
    workStartTime: "08:00",
    workEndTime: "17:00",
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 5,
    workMode: "OFFLINE",
    allowedOffDaysPerMonth: 2,
  });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    department: "",
    role: "EMPLOYEE",
    workStartTime: "",
    workEndTime: "",
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 5,
    workMode: "OFFLINE",
    allowedOffDaysPerMonth: 2,
    password: "",
  });

  const [detailUserId, setDetailUserId] = useState("");
  const [detailMonth, setDetailMonth] = useState(currentMonthVn);
  const [detailRows, setDetailRows] = useState<AttendanceRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    try {
      const data = await apiJson<User[]>("/api/admin/users");
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được tài khoản");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const monthOptions = buildMonthOptions();

  async function loadDetail(userId: string, month: string) {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ userId, month, limit: "500" });
      const data = await apiJson<{ items: AttendanceRow[] }>(`/api/admin/attendance?${params}`);
      setDetailRows(data.items);
    } catch {
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  }

  function openDetail(userId: string) {
    if (detailUserId === userId) {
      setDetailUserId("");
      setDetailRows([]);
      return;
    }
    setDetailUserId(userId);
    setEditingId("");
    loadDetail(userId, detailMonth);
  }

  function changeDetailMonth(month: string) {
    setDetailMonth(month);
    if (detailUserId) loadDetail(detailUserId, month);
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await apiJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        username: "",
        password: "",
        fullName: "",
        role: "EMPLOYEE",
        department: "",
        workStartTime: "08:00",
        workEndTime: "17:00",
        lateGraceMinutes: 5,
        earlyLeaveGraceMinutes: 5,
        workMode: "OFFLINE",
        allowedOffDaysPerMonth: 2,
      });
      await load();
      setMessage("Tạo tài khoản thành công");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo user thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(user: User) {
    const confirmed = window.confirm(`Xóa tài khoản "${user.username}"?`);
    if (!confirmed) return;
    try {
      await apiJson(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xóa được tài khoản");
    }
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email ?? "",
      department: user.department ?? "",
      role: user.role,
      workStartTime: user.workStartTime ?? "",
      workEndTime: user.workEndTime ?? "",
      lateGraceMinutes: user.lateGraceMinutes,
      earlyLeaveGraceMinutes: user.earlyLeaveGraceMinutes,
      workMode: user.workMode,
      allowedOffDaysPerMonth: user.allowedOffDaysPerMonth,
      password: "",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await apiJson(`/api/admin/users/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          password: editForm.password || undefined,
        }),
      });
      setEditingId("");
      await load();
      setMessage("Cập nhật tài khoản thành công");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật tài khoản thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tạo tài khoản</h3>
        <form onSubmit={createUser}>
          <div className="row" style={{ marginBottom: 8 }}>
            <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
            <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
            <input placeholder="Họ và tên" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
            <input placeholder="Chức vụ" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="EMPLOYEE">Nhân viên</option>
              <option value="ADMIN">Quản trị viên</option>
              {canAssignSuperAdmin && <option value="SUPER_ADMIN">Siêu quản trị</option>}
            </select>
            <select value={form.workMode} onChange={(e) => setForm((f) => ({ ...f, workMode: e.target.value as "ONLINE" | "OFFLINE" }))}>
              <option value="OFFLINE">Offline</option>
              <option value="ONLINE">Online</option>
            </select>
            <select value={form.workStartTime} onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))} title="Giờ bắt đầu">
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={form.workEndTime} onChange={(e) => setForm((f) => ({ ...f, workEndTime: e.target.value }))} title="Giờ kết thúc">
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" placeholder="Trễ (phút)" value={form.lateGraceMinutes} onChange={(e) => setForm((f) => ({ ...f, lateGraceMinutes: Number(e.target.value) }))} style={{ width: 80 }} title="Phút trễ cho phép" />
            <input type="number" placeholder="Sớm (phút)" value={form.earlyLeaveGraceMinutes} onChange={(e) => setForm((f) => ({ ...f, earlyLeaveGraceMinutes: Number(e.target.value) }))} style={{ width: 80 }} title="Phút về sớm cho phép" />
            <input type="number" min={0} max={31} placeholder="Off/tháng" value={form.allowedOffDaysPerMonth} onChange={(e) => setForm((f) => ({ ...f, allowedOffDaysPerMonth: Number(e.target.value) }))} style={{ width: 80 }} title="Số ngày off/tháng" />
            <button type="submit" disabled={loading}>{loading ? "Đang tạo..." : "Tạo"}</button>
          </div>
        </form>
        {error && <ErrorMessage error={error} />}
        {message && <SuccessMessage message={message} />}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách tài khoản</h3>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
          <thead>
            <tr>
              <th>Tên nhân viên</th>
              <th>Chức vụ</th>
              <th>Vai trò</th>
              <th>Giờ làm</th>
              <th>Hình thức</th>
              <th>Nghỉ/tháng</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const showInlineEdit = editingId === u.id;
              return (
                <Fragment key={u.id}>
                  <tr>
                    <td className="employee-name-cell">{`${u.username}`}</td>
                    <td>{u.department || "-"}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>
                      {u.workStartTime && u.workEndTime
                        ? `${u.workStartTime}-${u.workEndTime}`
                        : "-"}
                    </td>
                    <td>{workModeLabel(u.workMode)}</td>
                    <td>{u.allowedOffDaysPerMonth}</td>
                    <td>
                      <span className={`status-chip ${u.isActive ? "active" : "inactive"}`}>{u.isActive ? "active" : "inactive"}</span>
                    </td>
                    <td>
                      <div className="actions-col">
                        <button className="edit-btn" onClick={() => openDetail(u.id)}>
                          {detailUserId === u.id ? "Đóng" : "Chi tiết"}
                        </button>
                        <button className="edit-btn" onClick={() => (showInlineEdit ? setEditingId("") : openEdit(u))}>
                          {showInlineEdit ? "Đóng" : "Sửa"}
                        </button>
                        <button className="danger delete-btn" onClick={() => deleteUser(u)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showInlineEdit && (
                    <tr>
                      <td colSpan={8}>
                        <div className="admin-users-inline-panel">
                            <section>
                              <h4 style={{ marginTop: 0 }}>Chỉnh tài khoản: {u.username}</h4>
                              <div className="row">
                                <input value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Họ tên" />
                                <input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="Thư điện tử" />
                                <input value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))} placeholder="Chức vụ" />
                                <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                                  <option value="EMPLOYEE">Nhân viên</option>
                                  <option value="ADMIN">Quản trị viên</option>
                                  {canAssignSuperAdmin && <option value="SUPER_ADMIN">Siêu quản trị</option>}
                                </select>
                                <select value={editForm.workStartTime} onChange={(e) => setEditForm((f) => ({ ...f, workStartTime: e.target.value }))}>
                                  <option value="">--</option>
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select value={editForm.workEndTime} onChange={(e) => setEditForm((f) => ({ ...f, workEndTime: e.target.value }))}>
                                  <option value="">--</option>
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select value={editForm.workMode} onChange={(e) => setEditForm((f) => ({ ...f, workMode: e.target.value as "ONLINE" | "OFFLINE" }))}>
                                  <option value="OFFLINE">Offline</option>
                                  <option value="ONLINE">Online</option>
                                </select>
                                <input
                                  type="number"
                                  value={editForm.lateGraceMinutes}
                                  onChange={(e) => setEditForm((f) => ({ ...f, lateGraceMinutes: Number(e.target.value) }))}
                                  style={{ width: 90 }}
                                />
                                <input
                                  type="number"
                                  value={editForm.earlyLeaveGraceMinutes}
                                  onChange={(e) => setEditForm((f) => ({ ...f, earlyLeaveGraceMinutes: Number(e.target.value) }))}
                                  style={{ width: 90 }}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={31}
                                  value={editForm.allowedOffDaysPerMonth}
                                  onChange={(e) => setEditForm((f) => ({ ...f, allowedOffDaysPerMonth: Number(e.target.value) }))}
                                  style={{ width: 100 }}
                                />
                                <input
                                  type="password"
                                  value={editForm.password}
                                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                                  placeholder="Mật khẩu mới (nếu đổi)"
                                />
                                <button onClick={saveEdit}>Lưu</button>
                                <button className="secondary" onClick={() => setEditingId("")}>Hủy</button>
                              </div>
                            </section>
                        </div>
                      </td>
                    </tr>
                  )}
                  {detailUserId === u.id && (
                    <tr>
                      <td colSpan={8}>
                        <UserDetailPanel
                          user={u}
                          month={detailMonth}
                          monthOptions={monthOptions}
                          rows={detailRows}
                          loading={detailLoading}
                          onChangeMonth={changeDetailMonth}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
