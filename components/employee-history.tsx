"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel } from "@/lib/display-labels";

type Day = {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  warningFlagsJson: string | string[];
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

export default function EmployeeHistory() {
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7));
  const [rows, setRows] = useState<Day[]>([]);
  const [error, setError] = useState("");

  async function load(targetMonth = month) {
    setError("");
    try {
      const from = `${targetMonth}-01`;
      const to = `${targetMonth}-31`;
      const data = await apiJson<Day[]>(`/api/attendance/me?from=${from}&to=${to}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Lịch sử chấm công</h3>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Trạng thái</th>
            <th>Giờ vào</th>
            <th>Giờ ra</th>
            <th>Giờ công (phút)</th>
            <th>Cảnh báo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.workDate}</td>
              <td>{attendanceStatusLabel(r.status)}</td>
              <td>{r.checkInAt ? new Date(r.checkInAt).toLocaleString("vi-VN") : "-"}</td>
              <td>{r.checkOutAt ? new Date(r.checkOutAt).toLocaleString("vi-VN") : "-"}</td>
              <td>{r.workedMinutes ?? 0}</td>
              <td>{parseWarnings(r.warningFlagsJson).join(", ") || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
