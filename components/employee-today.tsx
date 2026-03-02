"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";

type BreakSession = {
  id: string;
  breakType: "WC_SMOKE" | "MEAL" | "OTHER";
  startAt: string;
  endAt: string | null;
  durationMinutesComputed: number | null;
};

type Day = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  workedMinutes: number | null;
  isOffDay: boolean;
  isDeducted: boolean;
  offReason: string | null;
  warningFlagsJson: string | string[];
  breakSessions: BreakSession[];
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

export default function EmployeeToday() {
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [breakType, setBreakType] = useState<"WC_SMOKE" | "MEAL" | "OTHER">("WC_SMOKE");

  const openBreak = useMemo(() => day?.breakSessions.find((b) => !b.endAt), [day]);

  async function load() {
    setError("");
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const data = await apiJson<Day[]>(`/api/attendance/me?from=${today}&to=${today}`);
      setDay(data[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function post(url: string, body?: unknown) {
    setLoading(true);
    setError("");
    try {
      await apiJson(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Hôm nay</h3>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
        {!day && <p>Chưa có dữ liệu chấm công hôm nay.</p>}
        {day && (
          <>
            <p>
              Trạng thái: <span className="badge">{day.status}</span>
            </p>
            <p>Check-in: {day.checkInAt ? new Date(day.checkInAt).toLocaleString("vi-VN") : "-"}</p>
            <p>Check-out: {day.checkOutAt ? new Date(day.checkOutAt).toLocaleString("vi-VN") : "-"}</p>
            <p>Giờ công: {day.workedMinutes ?? 0} phút</p>
            <p>Cảnh báo: {parseWarnings(day.warningFlagsJson).join(", ") || "Không"}</p>
            {day.isOffDay && (
              <p>
                Off hôm nay: {day.isDeducted ? "Vượt định mức - bị trừ công" : "Trong định mức"} {day.offReason ? `(${day.offReason})` : ""}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Thao tác chấm công</h3>
        <div className="row">
          <button disabled={loading} onClick={() => post("/api/attendance/check-in")}>
            Check-in
          </button>
          <button disabled={loading} className="secondary" onClick={() => post("/api/attendance/check-out")}>
            Check-out
          </button>
          <button
            disabled={loading || Boolean(day?.checkInAt) || Boolean(day?.checkOutAt) || Boolean(day?.isOffDay)}
            className="danger"
            onClick={() => post("/api/attendance/off-day", { reason: "Báo off bởi nhân viên" })}
          >
            Báo off hôm nay
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Nghỉ giữa ca</h3>
        <div className="row">
          <select value={breakType} onChange={(e) => setBreakType(e.target.value as typeof breakType)}>
            <option value="WC_SMOKE">WC/Smoke</option>
            <option value="MEAL">Ăn cơm</option>
            <option value="OTHER">Khác</option>
          </select>
          <button disabled={loading || Boolean(openBreak)} onClick={() => post("/api/attendance/breaks/start", { breakType })}>
            Bắt đầu nghỉ
          </button>
          <button disabled={loading || !openBreak} className="secondary" onClick={() => post("/api/attendance/breaks/end")}>
            Kết thúc nghỉ
          </button>
        </div>
        {openBreak && <p className="small">Đang nghỉ từ {new Date(openBreak.startAt).toLocaleTimeString("vi-VN")}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lịch sử nghỉ hôm nay</h3>
        <table>
          <thead>
            <tr>
              <th>Loại</th>
              <th>Bắt đầu</th>
              <th>Kết thúc</th>
              <th>Phút</th>
            </tr>
          </thead>
          <tbody>
            {(day?.breakSessions ?? []).map((b) => (
              <tr key={b.id}>
                <td>{b.breakType}</td>
                <td>{new Date(b.startAt).toLocaleTimeString("vi-VN")}</td>
                <td>{b.endAt ? new Date(b.endAt).toLocaleTimeString("vi-VN") : "Đang mở"}</td>
                <td>{b.durationMinutesComputed ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
