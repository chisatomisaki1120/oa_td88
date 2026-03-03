"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, breakTypeLabel } from "@/lib/display-labels";

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

const WEEK_DAYS = ["THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY", "CHỦ NHẬT"] as const;
const LEAVE_OPTIONS = ["Nghỉ phép", "Bổ sung thẻ", "Việc riêng", "Khác"] as const;
function getTodayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function toMonthDate(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function monthMeta(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  return { year, monthIndex, daysInMonth, offset };
}

function panelDateText(workDate: string) {
  const [y, m, d] = workDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEK_DAYS[(date.getDay() + 6) % 7];
  return `${workDate} ${weekday}`;
}

export default function EmployeeToday() {
  const [month, setMonth] = useState(getTodayVN().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(getTodayVN());
  const [selectedOffDates, setSelectedOffDates] = useState<string[]>([]);
  const [offDateSelectionMode, setOffDateSelectionMode] = useState(false);
  const [rows, setRows] = useState<Day[]>([]);
  const [clockText, setClockText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [breakType, setBreakType] = useState<"WC_SMOKE" | "MEAL" | "OTHER">("WC_SMOKE");
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_OPTIONS)[number]>("Nghỉ phép");
  const [note, setNote] = useState("");

  const rowsByDate = useMemo(() => new Map(rows.map((r) => [r.workDate, r])), [rows]);
  const selectedDay = rowsByDate.get(selectedDate) ?? null;
  const openBreak = useMemo(() => selectedDay?.breakSessions.find((b) => !b.endAt), [selectedDay]);
  const isToday = selectedDate === getTodayVN();
  const calendarMeta = useMemo(() => monthMeta(month), [month]);

  const cells = useMemo(() => {
    const total = Math.ceil((calendarMeta.offset + calendarMeta.daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const dayNumber = i - calendarMeta.offset + 1;
      if (dayNumber < 1 || dayNumber > calendarMeta.daysInMonth) return null;
      return dayNumber;
    });
  }, [calendarMeta]);

  async function load(targetMonth = month) {
    setError("");
    try {
      const { daysInMonth } = monthMeta(targetMonth);
      const from = `${targetMonth}-01`;
      const to = `${targetMonth}-${String(daysInMonth).padStart(2, "0")}`;
      const data = await apiJson<Day[]>(`/api/attendance/me?from=${from}&to=${to}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const formatNow = () =>
      new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    setClockText(formatNow());
    const timer = setInterval(() => setClockText(formatNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function post(url: string, body?: unknown) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await apiJson(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await load(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setLoading(false);
    }
  }

  function gotoMonth(delta: number) {
    const next = new Date(calendarMeta.year, calendarMeta.monthIndex + delta, 1);
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
    load(nextMonth);
  }

  async function submitOffDay() {
    if (selectedOffDates.length === 0) {
      setError("Vui lòng chọn ít nhất 1 ngày để báo nghỉ.");
      return;
    }
    const reason = `${leaveType}${note.trim() ? ` - ${note.trim()}` : ""}`;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await apiJson<{
        updatedDates: string[];
        skippedLockedMonth: string[];
        skippedAlreadyAttended: string[];
        skippedAlreadyOff: string[];
      }>("/api/attendance/off-days", {
        method: "POST",
        body: JSON.stringify({ dates: selectedOffDates, reason }),
      });
      await load(month);
      setSelectedOffDates([]);
      setOffDateSelectionMode(false);
      setNote("");
      setMessage(
        `Đã báo nghỉ ${result.updatedDates.length} ngày. Bỏ qua: khóa tháng ${result.skippedLockedMonth.length}, đã chấm công ${result.skippedAlreadyAttended.length}, đã nghỉ ${result.skippedAlreadyOff.length}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Báo nghỉ thất bại");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelectedOffDate(date: string) {
    setSelectedOffDates((current) => (current.includes(date) ? current.filter((d) => d !== date) : [...current, date].sort()));
  }

  return (
    <div className="employee-clock card">
      <div className="employee-clock__top">NGÀY GIỜ: {clockText}</div>
      <div className="employee-clock__layout">
        <div className="employee-clock__calendar">
          <div className="employee-clock__month-nav">
            <button className="secondary" type="button" onClick={() => gotoMonth(-1)}>
              &lt;
            </button>
            <strong>{month}</strong>
            <button className="secondary" type="button" onClick={() => gotoMonth(1)}>
              &gt;
            </button>
          </div>
          <table className="employee-clock__table">
            <thead>
              <tr>
                {WEEK_DAYS.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((value, cellIndex) => {
                    if (!value) return <td key={`empty-${rowIndex}-${cellIndex}`} className="employee-clock__cell employee-clock__cell--empty" />;
                    const date = toMonthDate(month, value);
                    const info = rowsByDate.get(date);
                    const isSelected = date === selectedDate;
                    const isCurrent = date === getTodayVN();
                    const isOffMarked = selectedOffDates.includes(date);
                    return (
                      <td
                        key={date}
                        className={`employee-clock__cell${isSelected ? " is-selected" : ""}${isCurrent ? " is-today" : ""}${isOffMarked ? " is-off-selected" : ""}`}
                        onClick={() => {
                          setSelectedDate(date);
                          if (offDateSelectionMode) {
                            toggleSelectedOffDate(date);
                          }
                        }}
                      >
                        <div className="employee-clock__cell-strip" />
                        <div className="employee-clock__cell-day">{value}</div>
                        {info && (
                          <div className="employee-clock__cell-content">
                            <p>Vào: {info.checkInAt ? new Date(info.checkInAt).toLocaleTimeString("vi-VN") : "-"}</p>
                            <p>Ra: {info.checkOutAt ? new Date(info.checkOutAt).toLocaleTimeString("vi-VN") : "-"}</p>
                            <p className="employee-clock__status">{attendanceStatusLabel(info.status)}</p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p style={{ color: "#b91c1c", marginTop: 8 }}>{error}</p>}
          {message && <p style={{ color: "#047857", marginTop: 8 }}>{message}</p>}
        </div>

        <aside className="employee-clock__side">
          <div className="employee-clock__panel-header">{panelDateText(selectedDate)}</div>

          <section className="employee-clock__panel">
            <h4>THẺ CHẤM CÔNG:</h4>
            <div className="employee-clock__action-row">
              <span>Lên ca: {selectedDay?.checkInAt ? new Date(selectedDay.checkInAt).toLocaleTimeString("vi-VN") : "--:--:--"}</span>
              <button disabled={loading || !isToday || Boolean(selectedDay?.checkInAt)} onClick={() => post("/api/attendance/check-in")}>
                ĐÁNH THẺ
              </button>
            </div>
            <div className="employee-clock__action-row">
              <span>Xuống ca: {selectedDay?.checkOutAt ? new Date(selectedDay.checkOutAt).toLocaleTimeString("vi-VN") : "--:--:--"}</span>
              <button
                disabled={loading || !isToday || !Boolean(selectedDay?.checkInAt) || Boolean(selectedDay?.checkOutAt)}
                onClick={() => post("/api/attendance/check-out")}
              >
                ĐÁNH THẺ
              </button>
            </div>
          </section>

          <section className="employee-clock__panel">
            <h4>GHI CHÚ:</h4>
            <div className="employee-clock__panel-actions">
              <button className={offDateSelectionMode ? "danger" : "secondary"} type="button" onClick={() => setOffDateSelectionMode((v) => !v)}>
                {offDateSelectionMode ? "TẮT CHỌN" : "CHỌN NGÀY OFF"}
              </button>
              <button className="secondary" type="button" onClick={() => setSelectedOffDates([])}>
                XÓA DANH SÁCH
              </button>
            </div>
            <p className="small">Đã chọn {selectedOffDates.length} ngày off.</p>
            <p className="small">{offDateSelectionMode ? "Bật chọn ngày off." : "Tắt chế độ chọn ngày off."}</p>
            <div className="employee-clock__note-row">
              <label htmlFor="leaveType">NGHỈ PHÉP:</label>
              <select id="leaveType" value={leaveType} onChange={(e) => setLeaveType(e.target.value as (typeof LEAVE_OPTIONS)[number])}>
                {LEAVE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." rows={6} />
            <div className="employee-clock__panel-actions">
              <button className="secondary" type="button" onClick={() => setNote("")}>
                XÓA GHI CHÚ
              </button>
              <button
                className="danger"
                type="button"
                disabled={loading || selectedOffDates.length === 0}
                onClick={submitOffDay}
              >
                BÁO OFF
              </button>
            </div>
            {selectedDay?.offReason && <p className="small">Đã báo off: {selectedDay.offReason}</p>}
          </section>

          <section className="employee-clock__panel">
            <h4>NGHỈ GIỮA CA:</h4>
            <div className="employee-clock__break-row">
              <select value={breakType} onChange={(e) => setBreakType(e.target.value as typeof breakType)}>
                <option value="WC_SMOKE">{breakTypeLabel("WC_SMOKE")}</option>
                <option value="MEAL">{breakTypeLabel("MEAL")}</option>
                <option value="OTHER">{breakTypeLabel("OTHER")}</option>
              </select>
              <button disabled={loading || !isToday || Boolean(openBreak)} onClick={() => post("/api/attendance/breaks/start", { breakType })}>
                BẮT ĐẦU
              </button>
              <button disabled={loading || !isToday || !openBreak} className="secondary" onClick={() => post("/api/attendance/breaks/end")}>
                KẾT THÚC
              </button>
            </div>
            {openBreak && <p className="small">Đang nghỉ từ {new Date(openBreak.startAt).toLocaleTimeString("vi-VN")}</p>}
          </section>
        </aside>
      </div>

      <div className="employee-clock__legend">
        <span className="late">Đi muộn về sớm</span>
        <span className="leave">Nghỉ phép</span>
        <span className="miss">Quên đánh thẻ</span>
        <span className="extra">Bổ sung thẻ</span>
        <span className="off">Nghỉ</span>
        <span className="today">HÔM NAY</span>
      </div>
      <div className="employee-clock__help">
        <p>
          <strong>Quy trình nghỉ phép:</strong> Bấm nút chọn ngày off, sau đó bấm vào các ngày trên lịch để chọn nhiều ngày và xác nhận báo off cùng lúc.
        </p>
      </div>
    </div>
  );
}
