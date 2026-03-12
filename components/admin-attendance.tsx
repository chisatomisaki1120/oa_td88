"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, breakTypeLabel } from "@/lib/display-labels";
import { fmtTime, fmtDateTime, buildMonthOptions, currentDateVn, currentMonthVn } from "@/lib/time";
import { ErrorMessage, EmptyState, SuccessMessage } from "@/components/ui-feedback";

type BreakRow = {
  id: string;
  breakType: string;
  startAt: string;
  endAt: string | null;
  durationMinutesComputed: number | null;
};

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
  breakSessions: BreakRow[];
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
  const [date, setDate] = useState(currentDateVn);
  const [exportMonth, setExportMonth] = useState(currentMonthVn);
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
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
                {u.username}
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowGroup
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                editing={editingId === row.id}
                onToggle={() => toggleExpand(row.id)}
                onEdit={() => startEdit(row)}
                onCancelEdit={() => setEditingId("")}
                onSave={save}
                saving={loading}
                checkInAt={checkInAt}
                checkOutAt={checkOutAt}
                onCheckInChange={setCheckInAt}
                onCheckOutChange={setCheckOutAt}
              />
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

function RowGroup({
  row,
  expanded,
  editing,
  onToggle,
  onEdit,
  onCancelEdit,
  onSave,
  saving,
  checkInAt,
  checkOutAt,
  onCheckInChange,
  onCheckOutChange,
}: {
  row: Row;
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  saving: boolean;
  checkInAt: string;
  checkOutAt: string;
  onCheckInChange: (v: string) => void;
  onCheckOutChange: (v: string) => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td>{row.workDate}</td>
        <td>{row.user.username}</td>
        <td>{row.user.department || "-"}</td>
        <td>{row.checkInAt ? fmtTime(row.checkInAt) : "-"}</td>
        <td>{row.checkOutAt ? fmtTime(row.checkOutAt) : "-"}</td>
        <td>{(() => {
          const onBreak = row.breakSessions.find((b) => !b.endAt);
          if (onBreak) return `Đang nghỉ ${breakTypeLabel(onBreak.breakType)}`;
          return attendanceStatusLabel(row.status, !!row.checkOutAt);
        })()}</td>
        <td>{row.isOffDay ? (row.isDeducted ? "Không phép" : "Có phép") : "-"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: "8px 16px", background: "var(--expanded-bg)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>Chi tiết ca làm — {row.user.username}</strong>
              <table style={{ margin: 0, fontSize: 14 }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, width: 180 }}>Lên ca</td>
                    <td>{row.checkInAt ? fmtDateTime(row.checkInAt) : "-"}</td>
                  </tr>
                  {row.breakSessions.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{breakTypeLabel(b.breakType)}</td>
                      <td>
                        {fmtTime(b.startAt)}
                        {" → "}
                        {b.endAt ? fmtTime(b.endAt) : <em>chưa quay lại</em>}
                        {b.durationMinutesComputed != null && ` (${b.durationMinutesComputed} phút)`}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 600 }}>Xuống ca</td>
                    <td>{row.checkOutAt ? fmtDateTime(row.checkOutAt) : "-"}</td>
                  </tr>
                  {row.workedMinutes != null && (
                    <tr>
                      <td style={{ fontWeight: 600 }}>Tổng giờ làm</td>
                      <td>{Math.floor(row.workedMinutes / 60)}h{row.workedMinutes % 60 > 0 ? `${row.workedMinutes % 60}p` : ""}</td>
                    </tr>
                  )}
                  {row.offReason && (
                    <tr>
                      <td style={{ fontWeight: 600 }}>Lý do nghỉ</td>
                      <td>{row.offReason}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {editing ? (
                <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13 }}>
                    Lên ca
                    <input type="datetime-local" value={checkInAt} onChange={(e) => onCheckInChange(e.target.value)} style={{ fontSize: 12, width: 180 }} />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Xuống ca
                    <input type="datetime-local" value={checkOutAt} onChange={(e) => onCheckOutChange(e.target.value)} style={{ fontSize: 12, width: 180 }} />
                  </label>
                  <button style={{ fontSize: 12, padding: "4px 12px" }} disabled={saving} onClick={(e) => { e.stopPropagation(); onSave(); }}>Lưu</button>
                  <button className="secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}>Hủy</button>
                </div>
              ) : (
                <div>
                  <button className="secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={(e) => { e.stopPropagation(); onEdit(); }}>Sửa giờ</button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
