"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, parseWarnings } from "@/lib/display-labels";
import { fmtDateTime, buildMonthOptions, currentDateVn, currentMonthVn } from "@/lib/time";
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
  const [date, setDate] = useState(currentDateVn());
  const [exportMonth, setExportMonth] = useState(currentMonthVn());
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
  const [stuckRows, setStuckRows] = useState<Row[]>([]);

  const monthOptions = useMemo(() => buildMonthOptions(), []);

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
      const [data, stuckData] = await Promise.all([
        apiJson<PaginatedResult>(`/api/admin/attendance?${params}`),
        apiJson<PaginatedResult>(`/api/admin/attendance?openOnly=1&limit=20`),
      ]);
      setRows(data.items);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(data.page);
      const today = currentDateVn();
      setStuckRows(stuckData.items.filter((item) => item.workDate < today));
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
    setMessage("");
    setError("");
  }

  function startResolveStuckShift(row: Row) {
    startEdit(row);
    setMessage(`Đang xử lý ca treo của ${row.user.fullName} ngày ${row.workDate}. Vui lòng nhập giờ xuống ca rồi bấm Lưu.`);
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
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {`Tháng ${m.slice(5, 7)}/${m.slice(0, 4)}`}
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
        <h3 style={{ marginTop: 0 }}>Ca treo cần xử lý</h3>
        {stuckRows.length === 0 ? (
          <p style={{ marginBottom: 0, color: "#047857" }}>Không có ca treo từ ngày làm việc trước.</p>
        ) : (
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Nhân viên</th>
                <th scope="col">Lên ca</th>
                <th scope="col">Xuống ca</th>
                <th scope="col">Trạng thái</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {stuckRows.map((row) => (
                <tr key={`stuck-${row.id}`}>
                  <td>{row.workDate}</td>
                  <td>{row.user.fullName} ({row.user.username})</td>
                  <td>{row.checkInAt ? fmtDateTime(row.checkInAt) : "-"}</td>
                  <td>{row.checkOutAt ? fmtDateTime(row.checkOutAt) : <strong style={{ color: "#b91c1c" }}>Chưa xuống ca</strong>}</td>
                  <td>{attendanceStatusLabel(row.status)}</td>
                  <td>
                    <button className="secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => startResolveStuckShift(row)}>
                      Xử lý ca treo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
              <th scope="col">Trạng thái</th>
              <th scope="col">Nghỉ</th>
              <th scope="col">Cảnh báo</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              editingId === row.id ? (
                <tr key={row.id}>
                  <td>{row.workDate}</td>
                  <td>{row.user.username}</td>
                  <td>{row.user.department || "-"}</td>
                  <td><input type="datetime-local" value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} style={{ fontSize: 12, width: 170 }} /></td>
                  <td><input type="datetime-local" value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} style={{ fontSize: 12, width: 170 }} /></td>
                  <td>{attendanceStatusLabel(row.status)}</td>
                  <td>{row.isOffDay ? (row.isDeducted ? "Không phép" : "Có phép") : "-"}</td>
                  <td>{parseWarnings(row.warningFlagsJson).join(", ") || "-"}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button style={{ fontSize: 12, padding: "2px 8px" }} disabled={loading} onClick={save}>Lưu</button>
                      <button className="secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setEditingId("")}>Hủy</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id}>
                  <td>{row.workDate}</td>
                  <td>{row.user.username}</td>
                  <td>{row.user.department || "-"}</td>
                  <td>{row.checkInAt ? fmtDateTime(row.checkInAt) : "-"}</td>
                  <td>{row.checkOutAt ? fmtDateTime(row.checkOutAt) : "-"}</td>
                  <td>{attendanceStatusLabel(row.status)}</td>
                  <td>{row.isOffDay ? (row.isDeducted ? "Không phép" : "Có phép") : "-"}</td>
                  <td>{parseWarnings(row.warningFlagsJson).join(", ") || "-"}</td>
                  <td>
                    <button className="secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => startEdit(row)}>Sửa</button>
                  </td>
                </tr>
              )
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
