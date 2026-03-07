"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { apiJson } from "@/lib/client-api";
import { roleLabel, workModeLabel } from "@/lib/display-labels";
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

type Props = {
  actorRole: Role;
};

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
    const confirmed = window.confirm(`Xóa tài khoản "${user.fullName} (${user.username})"?`);
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
        <form onSubmit={createUser} className="row">
          <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          <input placeholder="Họ và tên" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
          <input placeholder="Chức vụ" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="EMPLOYEE">Nhân viên</option>
            <option value="ADMIN">Quản trị viên</option>
            {canAssignSuperAdmin && <option value="SUPER_ADMIN">Siêu quản trị</option>}
          </select>
          <select value={form.workStartTime} onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.workEndTime} onChange={(e) => setForm((f) => ({ ...f, workEndTime: e.target.value }))}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.workMode} onChange={(e) => setForm((f) => ({ ...f, workMode: e.target.value as "ONLINE" | "OFFLINE" }))}>
            <option value="OFFLINE">Offline</option>
            <option value="ONLINE">Online</option>
          </select>
          <input
            type="number"
            placeholder="Phút trễ cho phép"
            value={form.lateGraceMinutes}
            onChange={(e) => setForm((f) => ({ ...f, lateGraceMinutes: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
          <input
            type="number"
            placeholder="Phút về sớm cho phép"
            value={form.earlyLeaveGraceMinutes}
            onChange={(e) => setForm((f) => ({ ...f, earlyLeaveGraceMinutes: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
          <input
            type="number"
            min={0}
            max={31}
            placeholder="Nghỉ/tháng"
            value={form.allowedOffDaysPerMonth}
            onChange={(e) => setForm((f) => ({ ...f, allowedOffDaysPerMonth: Number(e.target.value) }))}
            style={{ width: 100 }}
          />
          <button type="submit" disabled={loading}>{loading ? "Đang tạo..." : "Tạo"}</button>
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
                              <h4 style={{ marginTop: 0 }}>Chỉnh tài khoản: {u.fullName}</h4>
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
