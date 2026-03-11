"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { roleLabel } from "@/lib/display-labels";
import { fmtDateTime } from "@/lib/time";
import { ErrorMessage, SuccessMessage, EmptyState } from "@/components/ui-feedback";

type AdminSession = {
  id: string;
  ipAddress: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  user: { id: string; fullName: string; username: string; role: string };
};

export default function AdminSessions() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const data = await apiJson<AdminSession[]>("/api/admin/sessions");
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách phiên");
    }
  }

  useEffect(() => { load(); }, []);

  async function revoke(sessionId: string) {
    setError("");
    setMessage("");
    try {
      await apiJson("/api/admin/sessions", {
        method: "DELETE",
        body: JSON.stringify({ sessionId }),
      });
      setMessage("Đã đăng xuất phiên thành công");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng xuất phiên");
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Tất cả phiên đăng nhập</h3>
      {error && <ErrorMessage error={error} />}
      {message && <SuccessMessage message={message} />}
      <table>
        <thead>
          <tr>
            <th scope="col">Nhân viên</th>
            <th scope="col">Vai trò</th>
            <th scope="col">IP</th>
            <th scope="col">Hoạt động</th>
            <th scope="col">Hết hạn</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.user.username}</td>
              <td>{roleLabel(s.user.role)}</td>
              <td>{s.ipAddress}</td>
              <td>{fmtDateTime(s.lastSeenAt)}</td>
              <td>{fmtDateTime(s.expiresAt)}</td>
              <td>
                <button className="danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => revoke(s.id)}>
                  Đăng xuất
                </button>
              </td>
            </tr>
          ))}
          {sessions.length === 0 && <EmptyState message="Không có phiên nào đang hoạt động" />}
        </tbody>
      </table>
    </div>
  );
}
