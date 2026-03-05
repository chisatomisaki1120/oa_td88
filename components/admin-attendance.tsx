"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, parseWarnings } from "@/lib/display-labels";
import { fmtDateTime } from "@/lib/time";
import { ErrorMessage, EmptyState, SuccessMessage } from "@/components/ui-feedback";

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

type PaginatedResult = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type UserOption = {
  id: string;
  fullName: string;
  username: string;
};

export default function AdminAttendance() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }));
  const [exportMonth, setExportMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterUserId, setFilterUserId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);

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

  async function loadUsers() {
    try {
      const data = await apiJson<UserOption[]>("/api/admin/users");
      setUsers(data);
    } catch {
      // non-critical
    }
  }

  async function load(targetPage = page) {
    setError("");
    try {
      const params = new URLSearchParams({ date, page: String(targetPage) });
      if (filterUserId) params.set("userId", filterUserId);
      const data = await apiJson<PaginatedResult>(`/api/admin/attendance?${params}`);
      setRows(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load(1);
    loadUsers();
  }, []);

  async function save() {
    if (!editingId) return;
    setLoading(true);
    setMessage("");
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
      setMessage("Cập nhật chấm công thành công");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setCheckInAt(row.checkInAt ? new Date(row.checkInAt).toISOString().slice(0, 16) : "");
    setCheckOutAt(row.checkOutAt ? new Date(row.checkOutAt).toISOString().slice(0, 16) : "");
  }

  function handleFilter() {
    setPage(1);
    load(1);
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách chấm công</h3>
        <div className="row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="">-- Tất cả nhân viên --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.username})
              </option>
            ))}
          </select>
          <button onClick={handleFilter}>Lọc</button>
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
        {error && <ErrorMessage error={error} />}
        {message && <SuccessMessage message={message} />}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col">Nhân viên</th>
              <th scope="col">Chức vụ</th>
              <th scope="col">Lên ca</th>
              <th scope="col">Xuống ca</th>
              <th scope="col">Nghỉ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.workDate}</td>
                <td>{row.user.username}</td>
                <td>{row.user.department || "-"}</td>
                <td>{row.checkInAt ? fmtDateTime(row.checkInAt) : "-"}</td>
                <td>{row.checkOutAt ? fmtDateTime(row.checkOutAt) : "-"}</td>
                <td>{row.isOffDay ? (row.isDeducted ? "Off không phép" : "Off phép") : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyState />}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="secondary" disabled={page <= 1} onClick={() => load(page - 1)}>
              &lt; Trước
            </button>
            <span style={{ fontSize: 14 }}>
              Trang {page}/{totalPages} (tổng {total})
            </span>
            <button className="secondary" disabled={page >= totalPages} onClick={() => load(page + 1)}>
              Sau &gt;
            </button>
          </div>
        )}
      </div>
    </>
  );
}
