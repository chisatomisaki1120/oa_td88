"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";

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

export default function AdminUsers() {
  const [rows, setRows] = useState<User[]>([]);
  const [error, setError] = useState("");
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
      setError(err instanceof Error ? err.message : "Không tải được user");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError("");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo user thất bại");
    }
  }

  async function toggleActive(user: User) {
    try {
      await apiJson(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được trạng thái");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật tài khoản thất bại");
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tạo tài khoản</h3>
        <form onSubmit={createUser} className="row">
          <input placeholder="username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          <input placeholder="mật khẩu" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          <input placeholder="họ tên" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required />
          <input placeholder="phòng ban" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
          <input type="time" value={form.workStartTime} onChange={(e) => setForm((f) => ({ ...f, workStartTime: e.target.value }))} />
          <input type="time" value={form.workEndTime} onChange={(e) => setForm((f) => ({ ...f, workEndTime: e.target.value }))} />
          <select value={form.workMode} onChange={(e) => setForm((f) => ({ ...f, workMode: e.target.value as "ONLINE" | "OFFLINE" }))}>
            <option value="OFFLINE">OFFLINE</option>
            <option value="ONLINE">ONLINE</option>
          </select>
          <input
            type="number"
            placeholder="grace vào"
            value={form.lateGraceMinutes}
            onChange={(e) => setForm((f) => ({ ...f, lateGraceMinutes: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
          <input
            type="number"
            placeholder="grace ra"
            value={form.earlyLeaveGraceMinutes}
            onChange={(e) => setForm((f) => ({ ...f, earlyLeaveGraceMinutes: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
          <input
            type="number"
            min={0}
            max={31}
            placeholder="off/tháng"
            value={form.allowedOffDaysPerMonth}
            onChange={(e) => setForm((f) => ({ ...f, allowedOffDaysPerMonth: Number(e.target.value) }))}
            style={{ width: 100 }}
          />
          <button type="submit">Tạo</button>
        </form>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      </div>

      {editingId && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Chỉnh tài khoản</h3>
          <div className="row">
            <input value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Họ tên" />
            <input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
            <input value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))} placeholder="Phòng ban" />
            <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
            <input type="time" value={editForm.workStartTime} onChange={(e) => setEditForm((f) => ({ ...f, workStartTime: e.target.value }))} />
            <input type="time" value={editForm.workEndTime} onChange={(e) => setEditForm((f) => ({ ...f, workEndTime: e.target.value }))} />
            <select value={editForm.workMode} onChange={(e) => setEditForm((f) => ({ ...f, workMode: e.target.value as "ONLINE" | "OFFLINE" }))}>
              <option value="OFFLINE">OFFLINE</option>
              <option value="ONLINE">ONLINE</option>
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
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách tài khoản</h3>
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Họ tên</th>
              <th>Phòng ban</th>
              <th>Role</th>
              <th>Giờ làm</th>
              <th>Mode</th>
              <th>Off/tháng</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.fullName}</td>
                <td>{u.department || "-"}</td>
                <td>{u.role}</td>
                <td>
                  {u.workStartTime && u.workEndTime
                    ? `${u.workStartTime}-${u.workEndTime} (grace ${u.lateGraceMinutes}/${u.earlyLeaveGraceMinutes})`
                    : "Theo ca gán"}
                </td>
                <td>{u.workMode}</td>
                <td>{u.allowedOffDaysPerMonth}</td>
                <td>{u.isActive ? "ACTIVE" : "INACTIVE"}</td>
                <td>
                  <div className="row">
                    <button onClick={() => openEdit(u)}>Sửa</button>
                    <button className={u.isActive ? "danger" : "secondary"} onClick={() => toggleActive(u)}>
                      {u.isActive ? "Vô hiệu" : "Kích hoạt"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
