"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, parseWarnings } from "@/lib/display-labels";
import { fmtDateTime, currentMonthVn } from "@/lib/time";
import { ErrorMessage, EmptyState } from "@/components/ui-feedback";

type Day = {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  warningFlagsJson: string | string[];
};

type AttendanceMeResponse = {
  items: Day[];
};

export default function EmployeeHistory() {
  const [month, setMonth] = useState(currentMonthVn);
  const [rows, setRows] = useState<Day[]>([]);
  const [error, setError] = useState("");

  async function load(targetMonth = month) {
    setError("");
    try {
      const from = `${targetMonth}-01`;
      const to = `${targetMonth}-31`;
      const data = await apiJson<AttendanceMeResponse>(`/api/attendance/me?from=${from}&to=${to}`);
      setRows(data.items);
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
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }} />
      </div>
      {error && <ErrorMessage error={error} />}
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
              <td>{attendanceStatusLabel(r.status, !!r.checkOutAt)}</td>
              <td>{r.checkInAt ? fmtDateTime(r.checkInAt) : "-"}</td>
              <td>{r.checkOutAt ? fmtDateTime(r.checkOutAt) : "-"}</td>
              <td>{r.workedMinutes ?? 0}</td>
              <td>{parseWarnings(r.warningFlagsJson).join(", ") || "-"}</td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyState />}
        </tbody>
      </table>
    </div>
  );
}
