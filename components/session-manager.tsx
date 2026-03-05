"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";
import { fmtDateTime } from "@/lib/time";

type Session = {
  id: string;
  ipAddress: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export default function SessionManager() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const data = await apiJson<Session[]>("/api/account/sessions");
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
      await apiJson("/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify({ sessionId }),
      });
      setMessage("Đã đăng xuất phiên thành công");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng xuất phiên");
    }
  }

  function parseBrowser(ua: string | null) {
    if (!ua) return "Không rõ";
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    return ua.slice(0, 50);
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Phiên đăng nhập</h3>
      {error && <ErrorMessage error={error} />}
      {message && <SuccessMessage message={message} />}
      {sessions.length === 0 && <p className="small">Không có phiên nào đang hoạt động.</p>}
      {sessions.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <div>
            <strong>{parseBrowser(s.userAgent)}</strong> — {s.ipAddress}
            <br />
            <span className="small">
              Đăng nhập: {fmtDateTime(s.createdAt)} · Hoạt động: {fmtDateTime(s.lastSeenAt)}
            </span>
          </div>
          <button className="danger" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => revoke(s.id)}>
            Đăng xuất
          </button>
        </div>
      ))}
    </div>
  );
}
