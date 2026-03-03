"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel } from "@/lib/display-labels";

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
  const [exportMonth, setExportMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");

  const exportMonthOptions = useMemo(() => {
    const startYear = 2026;
    const startMonth = 3;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentKey = currentYear * 12 + currentMonth;
    const startKey = startYear * 12 + startMonth;

    const options: string[] = [];
    for (let key = currentKey; key >= startKey; key -= 1) {
      const year = Math.floor((key - 1) / 12);
      const month = ((key - 1) % 12) + 1;
      options.push(`${year}-${String(month).padStart(2, "0")}`);
    }
    return options;
  }, []);

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
          <select value={exportMonth} onChange={(e) => setExportMonth(e.target.value)}>
            {exportMonthOptions.map((month) => (
              <option key={month} value={month}>
                {`Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`}
              </option>
            ))}
          </select>
          <a href={`/api/admin/attendance/export.xlsx?month=${exportMonth}`}>
            <button type="button" className="secondary">
              Xuất Excel theo tháng
            </button>
          </a>
        </div>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Nhân viên</th>
              <th>Chức vụ</th>
              <th>Lên ca</th>
              <th>Xuống ca</th>
              <th>Nghỉ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.workDate}</td>
                <td>{row.user.fullName}</td>
                <td>{row.user.department || "-"}</td>
                <td>{row.checkInAt ? new Date(row.checkInAt).toLocaleString("vi-VN") : "-"}</td>
                <td>{row.checkOutAt ? new Date(row.checkOutAt).toLocaleString("vi-VN") : "-"}</td>
                <td>{row.isOffDay ? (row.isDeducted ? "Off không phép" : "Off phép") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
