"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";

type LeaveRequest = {
  id: string;
  userId: string;
  username: string;
  department: string | null;
  year: number;
  dates: string[];
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  quota: number;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

function fmtDateRange(dates: string[]) {
  if (dates.length === 0) return "-";
  if (dates.length === 1) return dates[0];
  const sorted = [...dates].sort();
  return `${sorted[0]} → ${sorted[sorted.length - 1]}`;
}

export default function AdminLeaveRequests() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "ALL") params.set("status", filterStatus);
      params.set("year", String(filterYear));
      const data = await apiJson<LeaveRequest[]>(`/api/admin/leave-requests?${params}`);
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterYear]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, action: "APPROVED" | "REJECTED", rejectedReason?: string) {
    setLoading(true);
    try {
      await apiJson(`/api/admin/leave-requests?id=${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ action, rejectedReason }),
      });
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setLoading(false);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <div>
      <h2>Duyệt nghỉ phép năm</h2>

      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="ALL">Tất cả</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
        <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
          {[0, 1, 2].map((d) => {
            const y = new Date().getFullYear() - d;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
        <button className="secondary" onClick={load} disabled={loading}>
          Tải lại
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card" style={{ marginBottom: 16, borderColor: "var(--primary)" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
          📋 Đơn chờ duyệt ({pending.length})
        </h3>
        {pending.length === 0 && !loading && (
          <p className="small" style={{ textAlign: "center", padding: 16 }}>Không có đơn chờ duyệt.</p>
        )}
        {pending.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Phòng ban</th>
                <th>Ngày nghỉ</th>
                <th>Lý do</th>
                <th>Ngày gửi</th>
                <th>Hạn mức</th>
                <th style={{ width: 180 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.username}</td>
                  <td>{r.department ?? "-"}</td>
                  <td>
                    {fmtDateRange(r.dates)}
                    <span className="small"> ({r.dates.length} ngày)</span>
                  </td>
                  <td>{r.reason || "-"}</td>
                  <td className="small">{new Date(r.createdAt).toLocaleDateString("vi-VN")}</td>
                  <td className="small">{r.quota} ngày/năm</td>
                  <td>
                    {rejectId === r.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <input
                          type="text"
                          placeholder="Lý do từ chối..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          style={{ fontSize: 12, padding: 4 }}
                        />
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="danger"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            disabled={loading}
                            onClick={() => review(r.id, "REJECTED", rejectReason || undefined)}
                          >
                            Xác nhận
                          </button>
                          <button
                            className="secondary"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => { setRejectId(null); setRejectReason(""); }}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          disabled={loading}
                          onClick={() => review(r.id, "APPROVED")}
                        >
                          ✓ Duyệt
                        </button>
                        <button
                          className="danger"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          disabled={loading}
                          onClick={() => setRejectId(r.id)}
                        >
                          ✕ Từ chối
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Lịch sử duyệt ({reviewed.length})</h3>
        {reviewed.length === 0 && !loading && (
          <p className="small" style={{ textAlign: "center", padding: 16 }}>Không có lịch sử duyệt.</p>
        )}
        {reviewed.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Ngày nghỉ</th>
                <th>Lý do</th>
                <th>Trạng thái</th>
                <th>Người duyệt</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.username}</td>
                  <td>
                    {fmtDateRange(r.dates)}
                    <span className="small"> ({r.dates.length} ngày)</span>
                  </td>
                  <td>{r.reason || "-"}</td>
                  <td>
                    <span
                      className={`status-chip ${r.status === "APPROVED" ? "active" : "inactive"}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="small">{r.reviewerName ?? "-"}</td>
                  <td className="small">{r.rejectedReason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
