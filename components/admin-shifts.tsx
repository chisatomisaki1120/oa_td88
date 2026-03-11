"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { ErrorMessage, EmptyState } from "@/components/ui-feedback";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type User = {
  id: string;
  fullName: string;
  username: string;
};

export default function AdminShifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", startTime: "08:00", endTime: "17:00", lateGraceMinutes: 5, earlyLeaveGraceMinutes: 5 });
  const [assign, setAssign] = useState({ userId: "", shiftId: "", effectiveFrom: new Date().toISOString().slice(0, 10) });

  async function load() {
    try {
      const [shiftData, userData] = await Promise.all([
        apiJson<Shift[]>("/api/admin/shifts"),
        apiJson<User[]>("/api/admin/users"),
      ]);
      setShifts(shiftData);
      setUsers(userData);
      if (!assign.userId && userData[0]) setAssign((a) => ({ ...a, userId: userData[0].id }));
      if (!assign.shiftId && shiftData[0]) setAssign((a) => ({ ...a, shiftId: shiftData[0].id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createShift(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiJson("/api/admin/shifts", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", startTime: "08:00", endTime: "17:00", lateGraceMinutes: 5, earlyLeaveGraceMinutes: 5 });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tạo ca thất bại");
    }
  }

  async function assignShift(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiJson("/api/admin/shift-assignments", {
        method: "POST",
        body: JSON.stringify({
          ...assign,
          effectiveFrom: new Date(`${assign.effectiveFrom}T00:00:00.000+07:00`).toISOString(),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gán ca thất bại");
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tạo ca làm</h3>
        <form className="row" onSubmit={createShift}>
          <input placeholder="Tên ca" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <select value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit">Tạo ca</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Gán ca nhân viên</h3>
        <form className="row" onSubmit={assignShift}>
          <select value={assign.userId} onChange={(e) => setAssign((a) => ({ ...a, userId: e.target.value }))}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
          <select value={assign.shiftId} onChange={(e) => setAssign((a) => ({ ...a, shiftId: e.target.value }))}>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime} - {s.endTime})
              </option>
            ))}
          </select>
          <input type="date" value={assign.effectiveFrom} onChange={(e) => setAssign((a) => ({ ...a, effectiveFrom: e.target.value }))} />
          <button type="submit">Gán</button>
        </form>
        {error && <ErrorMessage error={error} />}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách ca</h3>
        <table>
          <thead>
            <tr>
              <th>Tên ca</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.startTime}</td>
                <td>{s.endTime}</td>
              </tr>
            ))}
            {shifts.length === 0 && <EmptyState />}
          </tbody>
        </table>
      </div>
    </>
  );
}
