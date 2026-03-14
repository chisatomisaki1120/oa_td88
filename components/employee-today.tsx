"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { attendanceStatusLabel, breakTypeLabel, warningLabel, parseWarnings } from "@/lib/display-labels";
import { fmtDateTime, fmtTime, VN_TIMEZONE } from "@/lib/time";

type BreakSession = {
  id: string;
  breakType: "WC" | "SMOKE" | "MEAL" | "OTHER";
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

type PendingPreviousShift = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
};

const WEEK_DAYS = ["THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY", "CHỦ NHẬT"] as const;
const LEAVE_OPTIONS = ["Nghỉ phép", "Bổ sung thẻ", "Việc riêng", "Khác"] as const;
function getTodayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: VN_TIMEZONE });
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
  const todayVn = getTodayVN();
  const [month, setMonth] = useState(getTodayVN().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayVn);
  const [selectedOffDates, setSelectedOffDates] = useState<string[]>([]);
  const [offDateSelectionMode, setOffDateSelectionMode] = useState(false);
  const [rows, setRows] = useState<Day[]>([]);
  const [pendingPreviousShift, setPendingPreviousShift] = useState<PendingPreviousShift | null>(null);
  const [clockText, setClockText] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showPopup = useCallback((text: string, type: "success" | "error") => {
    clearTimeout(popupTimerRef.current);
    setPopup({ text, type });
    popupTimerRef.current = setTimeout(() => setPopup(null), 4000);
  }, []);
  const [breakType, setBreakType] = useState<"WC" | "SMOKE" | "MEAL" | "OTHER">("WC");
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_OPTIONS)[number]>("Nghỉ phép");
  const [note, setNote] = useState("");

  // Annual leave state
  type LeaveReq = { id: string; dates: string[]; reason: string | null; status: string; reviewerName: string | null; rejectedReason: string | null; createdAt: string };
  const [leaveRequests, setLeaveRequests] = useState<LeaveReq[]>([]);
  const [leaveQuota, setLeaveQuota] = useState(15);
  const [leaveUsed, setLeaveUsed] = useState(0);
  const [annualLeaveDates, setAnnualLeaveDates] = useState<string[]>([]);
  const [annualLeaveMode, setAnnualLeaveMode] = useState(false);
  const [annualLeaveReason, setAnnualLeaveReason] = useState("");

  const rowsByDate = useMemo(() => new Map(rows.map((r) => [r.workDate, r])), [rows]);
  const selectedDay = rowsByDate.get(selectedDate) ?? null;
  const todayDay = rowsByDate.get(todayVn) ?? null;
  const activeShiftDay = useMemo(
    () => rows.find((r) => Boolean(r.checkInAt) && !r.checkOutAt && !r.isOffDay) ?? null,
    [rows],
  );
  const actionDay = useMemo(() => activeShiftDay ?? todayDay ?? selectedDay, [activeShiftDay, selectedDay, todayDay]);
  const openBreak = useMemo(() => actionDay?.breakSessions.find((b) => !b.endAt), [actionDay]);
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
    try {
      const { daysInMonth } = monthMeta(targetMonth);
      // Include last day of previous month to capture open overnight shifts at month boundary
      const [y, m] = targetMonth.split("-").map(Number);
      const prevLast = new Date(y, m - 1, 0);
      const from = `${prevLast.getFullYear()}-${String(prevLast.getMonth() + 1).padStart(2, "0")}-${String(prevLast.getDate()).padStart(2, "0")}`;
      const to = `${targetMonth}-${String(daysInMonth).padStart(2, "0")}`;
      const data = await apiJson<{ items: Day[]; pendingPreviousShift: PendingPreviousShift | null }>(`/api/attendance/me?from=${from}&to=${to}`);
      setRows(data.items);
      setPendingPreviousShift(data.pendingPreviousShift);
    } catch (err) {
      showPopup(err instanceof Error ? err.message : "Không tải được dữ liệu", "error");
    }
  }

  async function loadLeaveRequests() {
    try {
      const data = await apiJson<{ requests: LeaveReq[]; quota: number; usedDays: number }>(
        `/api/attendance/leave-requests?year=${new Date().getFullYear()}`,
      );
      setLeaveRequests(data.requests);
      setLeaveQuota(data.quota);
      setLeaveUsed(data.usedDays);
    } catch { /* ignore */ }
  }

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load();
    loadLeaveRequests();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadRef.current();
    };
    const onFocus = () => loadRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const formatNow = () => fmtDateTime(new Date());
    setClockText(formatNow());
    const timer = setInterval(() => setClockText(formatNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  const postingRef = useRef(false);
  async function post(url: string, body?: unknown, successMsg?: string) {
    if (postingRef.current) return;
    postingRef.current = true;
    setLoading(true);
    try {
      await apiJson(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      const currentMonth = todayVn.slice(0, 7);
      setMonth(currentMonth);
      setSelectedDate(todayVn);
      await load(currentMonth);
      if (successMsg) showPopup(successMsg, "success");
    } catch (err) {
      showPopup(err instanceof Error ? err.message : "Thao tác thất bại", "error");
      await load().catch(() => {});
    } finally {
      postingRef.current = false;
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
      showPopup("Vui lòng chọn ít nhất 1 ngày để báo nghỉ.", "error");
      return;
    }
    const reason = `${leaveType}${note.trim() ? ` - ${note.trim()}` : ""}`;
    setLoading(true);
    try {
      const result = await apiJson<{
        updatedDates: string[];
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
      showPopup(
        `Đã báo nghỉ ${result.updatedDates.length} ngày. Bỏ qua: đã chấm công ${result.skippedAlreadyAttended.length}, đã nghỉ ${result.skippedAlreadyOff.length}.`,
        "success",
      );
    } catch (err) {
      showPopup(err instanceof Error ? err.message : "Báo nghỉ thất bại", "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelectedOffDate(date: string) {
    setSelectedOffDates((current) => (current.includes(date) ? current.filter((d) => d !== date) : [...current, date].sort()));
  }

  function toggleAnnualLeaveDate(date: string) {
    setAnnualLeaveDates((current) => (current.includes(date) ? current.filter((d) => d !== date) : [...current, date].sort()));
  }

  async function submitAnnualLeave() {
    if (annualLeaveDates.length === 0) {
      showPopup("Vui lòng chọn ít nhất 1 ngày nghỉ phép năm.", "error");
      return;
    }
    setLoading(true);
    try {
      await apiJson("/api/attendance/leave-requests", {
        method: "POST",
        body: JSON.stringify({ dates: annualLeaveDates, reason: annualLeaveReason.trim() || undefined }),
      });
      setAnnualLeaveDates([]);
      setAnnualLeaveMode(false);
      setAnnualLeaveReason("");
      await loadLeaveRequests();
      showPopup(`Đã gửi đơn nghỉ phép năm ${annualLeaveDates.length} ngày. Chờ admin duyệt.`, "success");
    } catch (err) {
      showPopup(err instanceof Error ? err.message : "Gửi đơn thất bại", "error");
    } finally {
      setLoading(false);
    }
  }

  const statusBanner = useMemo(() => {
    if (!actionDay) return { text: "Chưa có dữ liệu chấm công", level: "neutral" as const };
    if (actionDay.isOffDay) return { text: `Nghỉ phép${actionDay.offReason ? ` — ${actionDay.offReason}` : ""}`, level: "off" as const };
    if (!actionDay.checkInAt) return { text: "Chưa lên ca", level: "warn" as const };
    if (openBreak) return { text: `Đang nghỉ ${breakTypeLabel(openBreak.breakType)} từ ${fmtTime(openBreak.startAt)}`, level: "break" as const };
    if (!actionDay.checkOutAt) return { text: `Đang làm việc — Lên ca lúc ${fmtTime(actionDay.checkInAt)}`, level: "active" as const };
    return { text: `Đã xuống ca lúc ${fmtTime(actionDay.checkOutAt)}${actionDay.workedMinutes != null ? ` — ${Math.floor(actionDay.workedMinutes / 60)}h${String(actionDay.workedMinutes % 60).padStart(2, "0")}p` : ""}`, level: "done" as const };
  }, [actionDay, openBreak]);

  const warnings = useMemo(() => {
    if (!actionDay) return [];
    return parseWarnings(actionDay.warningFlagsJson);
  }, [actionDay]);

  return (
    <div className="employee-clock card">
      <div className="employee-clock__top">NGÀY GIỜ: {clockText}</div>
      <div className={`employee-clock__status-banner employee-clock__status-banner--${statusBanner.level}`}>
        <span className="employee-clock__status-dot" />
        <span>{statusBanner.text}</span>
      </div>
      {pendingPreviousShift && (
        <div className="employee-clock__warnings">
          <span className="employee-clock__warning-tag">
            ⚠ Ca trước ({pendingPreviousShift.workDate}) chưa xuống ca.
          </span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="employee-clock__warnings">
          {warnings.map((w) => (
            <span key={w} className="employee-clock__warning-tag">⚠ {warningLabel(w)}</span>
          ))}
        </div>
      )}
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
                    const isCurrent = date === todayVn;
                    const isOffMarked = selectedOffDates.includes(date);
                    const isAnnualLeaveMarked = annualLeaveDates.includes(date);
                    return (
                      <td
                        key={date}
                        className={`employee-clock__cell${isSelected ? " is-selected" : ""}${isCurrent ? " is-today" : ""}${isOffMarked ? " is-off-selected" : ""}${isAnnualLeaveMarked ? " is-annual-leave-selected" : ""}`}
                        onClick={() => {
                          setSelectedDate(date);
                          if (annualLeaveMode) {
                            toggleAnnualLeaveDate(date);
                          } else if (offDateSelectionMode) {
                            toggleSelectedOffDate(date);
                          }
                        }}
                      >
                        <div className={`employee-clock__cell-strip${info ? " strip--" + info.status.toLowerCase().replace("_", "-") : ""}`} />
                        <div className="employee-clock__cell-day">{value}</div>
                        {info && (
                          <div className="employee-clock__cell-content">
                            <p>Vào: {info.checkInAt ? new Date(info.checkInAt).toLocaleTimeString("vi-VN") : "-"}</p>
                            <p>Ra: {info.checkOutAt ? new Date(info.checkOutAt).toLocaleTimeString("vi-VN") : "-"}</p>
                            <p className="employee-clock__status">{attendanceStatusLabel(info.status, !!info.checkOutAt)}</p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

        </div>

        <aside className="employee-clock__side">
          <div className="employee-clock__panel-header">{panelDateText(selectedDate)}</div>

          <section className="employee-clock__panel">
            <h4>THẺ CHẤM CÔNG:</h4>
            {selectedDate !== todayVn && <p className="small">Đánh thẻ chỉ áp dụng cho ngày hôm nay ({todayVn}).</p>}
            <div className="employee-clock__action-row">
              <span>Lên ca: {actionDay?.checkInAt ? fmtTime(actionDay.checkInAt) : "--:--:--"}</span>
              <button disabled={loading || Boolean(todayDay?.checkInAt) || Boolean(activeShiftDay)} onClick={() => post("/api/attendance/check-in", undefined, "Đã lên ca thành công!")}>
                ĐÁNH THẺ
              </button>
            </div>
            <div className="employee-clock__action-row">
              <span>Xuống ca: {actionDay?.checkOutAt ? fmtTime(actionDay.checkOutAt) : "--:--:--"}</span>
              <button
                disabled={loading || !Boolean(actionDay?.checkInAt) || Boolean(actionDay?.checkOutAt) || Boolean(openBreak)}
                onClick={() => post("/api/attendance/check-out", undefined, "Đã xuống ca thành công!")}
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
            {(() => {
              const registeredOffDays = rows.filter((r) => r.isOffDay && !r.checkInAt && !r.checkOutAt);
              if (registeredOffDays.length === 0) return null;
              return (
                <div style={{ marginTop: 8 }}>
                  <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Ngày off đã đăng ký (tháng {month}):</p>
                  {registeredOffDays.map((r) => (
                    <div key={r.workDate} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{r.workDate} — {r.offReason || "Không ghi chú"}</span>
                      <button
                        className="danger"
                        type="button"
                        disabled={loading}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={async () => {
                          setLoading(true);
                          try {
                            const result = await apiJson<{ cancelledDates: string[]; skippedHasAttendance: string[] }>("/api/attendance/off-days", {
                              method: "DELETE",
                              body: JSON.stringify({ dates: [r.workDate] }),
                            });
                            await load(month);
                            if (result.cancelledDates.length > 0) {
                              showPopup(`Đã hủy off ngày ${r.workDate}`, "success");
                            } else {
                              showPopup("Không thể hủy — ngày đã có chấm công", "error");
                            }
                          } catch (err) {
                            showPopup(err instanceof Error ? err.message : "Hủy off thất bại", "error");
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        HỦY
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>

          <section className="employee-clock__panel">
            <h4>NGHỈ GIỮA CA:</h4>
            {!actionDay?.checkInAt && <p className="small" style={{ color: "var(--danger)" }}>Bạn chưa lên ca, không thể bắt đầu nghỉ.</p>}
            {actionDay?.checkOutAt && <p className="small" style={{ color: "var(--danger)" }}>Bạn đã xuống ca, không thể bắt đầu nghỉ.</p>}
            {openBreak && <p className="small" style={{ color: "var(--primary)" }}>Đang nghỉ {breakTypeLabel(openBreak.breakType)} từ {fmtTime(openBreak.startAt)} — bấm KẾT THÚC để hoàn tất.</p>}
            {actionDay?.checkInAt && !actionDay?.checkOutAt && !openBreak && <p className="small" style={{ color: "var(--primary)" }}>Chọn loại nghỉ và bấm BẮT ĐẦU.</p>}
            <div className="employee-clock__break-row">
              <select value={breakType} onChange={(e) => setBreakType(e.target.value as typeof breakType)}>
                <option value="WC">{breakTypeLabel("WC")}</option>
                <option value="SMOKE">{breakTypeLabel("SMOKE")}</option>
                <option value="MEAL">{breakTypeLabel("MEAL")}</option>
                <option value="OTHER">{breakTypeLabel("OTHER")}</option>
              </select>
              <button
                disabled={loading || !Boolean(actionDay?.checkInAt) || Boolean(actionDay?.checkOutAt)}
                onClick={() => {
                  if (openBreak) {
                    showPopup(`Bạn đang nghỉ ${breakTypeLabel(openBreak.breakType)}, vui lòng kết thúc trước khi bắt đầu nghỉ khác.`, "error");
                    return;
                  }
                  post("/api/attendance/breaks/start", { breakType }, `Bắt đầu ${breakTypeLabel(breakType)}`);
                }}
              >
                BẮT ĐẦU
              </button>
              <button disabled={loading || !openBreak} className="secondary" onClick={() => post("/api/attendance/breaks/end", undefined, "Đã kết thúc nghỉ!")}>
                KẾT THÚC
              </button>
            </div>
          </section>

          <section className="employee-clock__panel">
            <h4>NGHỈ PHÉP NĂM:</h4>
            <p className="small">Hạn mức: <strong>{leaveQuota}</strong> ngày/năm — Đã dùng: <strong>{leaveUsed}</strong> — Còn lại: <strong>{leaveQuota - leaveUsed}</strong></p>
            <div className="employee-clock__panel-actions" style={{ marginBottom: 6 }}>
              <button
                className={annualLeaveMode ? "danger" : "secondary"}
                type="button"
                onClick={() => { setAnnualLeaveMode((v) => !v); if (annualLeaveMode) setAnnualLeaveDates([]); }}
              >
                {annualLeaveMode ? "TẮT CHỌN" : "CHỌN NGÀY NGHỈ PHÉP NĂM"}
              </button>
            </div>
            {annualLeaveMode && (
              <>
                <p className="small">Đã chọn {annualLeaveDates.length} ngày. Bấm vào lịch để chọn/bỏ ngày.</p>
                <textarea
                  value={annualLeaveReason}
                  onChange={(e) => setAnnualLeaveReason(e.target.value)}
                  placeholder="Lý do nghỉ phép (không bắt buộc)..."
                  rows={2}
                  style={{ marginBottom: 6 }}
                />
                <button
                  type="button"
                  disabled={loading || annualLeaveDates.length === 0}
                  onClick={submitAnnualLeave}
                >
                  GỬI ĐƠN NGHỈ PHÉP NĂM
                </button>
              </>
            )}
            {leaveRequests.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Đơn đã gửi:</p>
                {leaveRequests.map((lr) => (
                  <div key={lr.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className={`badge${lr.status === "APPROVED" ? "" : lr.status === "REJECTED" ? "" : ""}`} style={{
                      background: lr.status === "APPROVED" ? "var(--primary)" : lr.status === "REJECTED" ? "var(--danger)" : "var(--badge-bg)",
                      color: lr.status === "PENDING" ? "var(--badge-text)" : "#fff",
                      marginRight: 4,
                    }}>
                      {lr.status === "PENDING" ? "Chờ duyệt" : lr.status === "APPROVED" ? "Đã duyệt" : "Từ chối"}
                    </span>
                    <span>{lr.dates.length} ngày ({lr.dates.length > 1 ? `${lr.dates[0]} → ${lr.dates[lr.dates.length - 1]}` : lr.dates[0]})</span>
                    {lr.reason && <span className="small"> — {lr.reason}</span>}
                    {lr.rejectedReason && <span style={{ color: "var(--danger)" }}> — Lý do: {lr.rejectedReason}</span>}
                  </div>
                ))}
              </div>
            )}
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

      {popup && (
        <div className="employee-clock__popup-overlay" onClick={() => setPopup(null)}>
          <div className={`employee-clock__popup employee-clock__popup--${popup.type}`} onClick={(e) => e.stopPropagation()}>
            <span className="employee-clock__popup-icon">{popup.type === "success" ? "✓" : "✕"}</span>
            <p>{popup.text}</p>
            <button className="secondary" type="button" onClick={() => setPopup(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
