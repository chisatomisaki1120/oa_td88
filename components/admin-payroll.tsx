"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { buildMonthOptions, currentMonthVn } from "@/lib/time";
import { ErrorMessage, EmptyState } from "@/components/ui-feedback";

type PayrollRow = {
  userId: string;
  fullName: string;
  username: string;
  department: string;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  offDaysPaid: number;
  offDaysDeducted: number;
  totalWorkedMinutes: number;
  overtimeMinutes: number;
  warningDays: number;
  allowedOff: number;
  remainingOff: number;
};



export default function AdminPayroll() {
  const [month, setMonth] = useState(currentMonthVn);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [error, setError] = useState("");

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  async function load() {
    setError("");
    try {
      const data = await apiJson<PayrollRow[]>(`/api/admin/payroll?month=${month}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => { load(); }, [month]);

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Báo cáo lương</h3>
        <div className="row">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>
            ))}
          </select>
          <button onClick={load}>Tải lại</button>
          <a href={`/api/admin/payroll/export.xlsx?month=${month}`}>
            <button type="button" className="secondary">Xuất Excel</button>
          </a>
        </div>
        {error && <ErrorMessage error={error} />}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th scope="col">Nhân viên</th>
              <th scope="col">Chức vụ</th>
              <th scope="col">Ngày công</th>
              <th scope="col">Đi muộn</th>
              <th scope="col">Về sớm</th>
              <th scope="col">Vắng</th>
              <th scope="col">Nghỉ phép</th>
              <th scope="col">Trừ lương</th>
              <th scope="col">Phép còn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>{r.username}</td>
                <td>{r.department || "-"}</td>
                <td>{r.presentDays}</td>
                <td style={{ color: r.lateDays > 0 ? "#b91c1c" : undefined }}>{r.lateDays}</td>
                <td>{r.earlyLeaveDays}</td>
                <td style={{ color: r.absentDays > 0 ? "#b91c1c" : undefined }}>{r.absentDays}</td>
                <td>{r.offDaysPaid}</td>
                <td style={{ color: r.offDaysDeducted > 0 ? "#b91c1c" : undefined }}>{r.offDaysDeducted}</td>
                <td>{r.remainingOff}</td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyState message="Không có dữ liệu tháng này" />}
          </tbody>
        </table>
      </div>
    </>
  );
}
