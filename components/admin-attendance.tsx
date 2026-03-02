"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";

type Row = {
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
  user: {
    id: string;
    fullName: string;
    username: string;
    department: string | null;
  };
};

function parseWarnings(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export default function AdminAttendance() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }));
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");

  async function load() {
    setError("");
    try {
      const data = await apiJson<Row[]>(`/api/admin/attendance?date=${date}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editingId) return;
    try {
      await apiJson(`/api/admin/attendance/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          checkInAt: checkInAt ? new Date(checkInAt).toISOString() : null,
          checkOutAt: checkOutAt ? new Date(checkOutAt).toISOString() : null,
        }),
      });
      setEditingId("");
      setCheckInAt("");
      setCheckOutAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại");
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setCheckInAt(row.checkInAt ? new Date(row.checkInAt).toISOString().slice(0, 16) : "");
    setCheckOutAt(row.checkOutAt ? new Date(row.checkOutAt).toISOString().slice(0, 16) : "");
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách chấm công</h3>
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={load}>Lọc</button>
          <a href={`/api/admin/attendance/export.csv?month=${date.slice(0, 7)}`}>
            <button type="button" className="secondary">
              Xuất CSV tổng hợp theo nhân viên
            </button>
          </a>
        </div>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      </div>

      {editingId && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Chỉnh công</h4>
          <div className="row">
            <label>Check-in</label>
            <input type="datetime-local" value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} />
            <label>Check-out</label>
            <input type="datetime-local" value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} />
            <button onClick={save}>Lưu</button>
            <button className="secondary" onClick={() => setEditingId("")}>
              Hủy
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Nhân viên</th>
              <th>Phòng ban</th>
              <th>Trạng thái</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Phút công</th>
              <th>Off</th>
              <th>Cảnh báo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.workDate}</td>
                <td>
                  {row.user.fullName} ({row.user.username})
                </td>
                <td>{row.user.department || "-"}</td>
                <td>{row.status}</td>
                <td>{row.checkInAt ? new Date(row.checkInAt).toLocaleString("vi-VN") : "-"}</td>
                <td>{row.checkOutAt ? new Date(row.checkOutAt).toLocaleString("vi-VN") : "-"}</td>
                <td>{row.workedMinutes ?? 0}</td>
                <td>{row.isOffDay ? (row.isDeducted ? "Có (bị trừ)" : "Có") : "-"}</td>
                <td>{parseWarnings(row.warningFlagsJson).join(", ") || "-"}</td>
                <td>
                  <button onClick={() => startEdit(row)}>Sửa</button>
                  <a href={`/api/admin/attendance/export.csv?month=${date.slice(0, 7)}&userId=${row.user.id}`}>
                    <button type="button" className="secondary">
                      Xuất CSV NV
                    </button>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
