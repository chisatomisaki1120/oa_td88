"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { ErrorMessage } from "@/components/ui-feedback";

type EmpInfo = { fullName: string; username: string };

type DashboardData = {
  today: {
    date: string;
    totalEmployees: number;
    present: number;
    late: number;
    absent: number;
    off: number;
    incomplete: number;
    notCheckedIn: number;
    presentList: EmpInfo[];
    lateList: EmpInfo[];
    absentList: EmpInfo[];
    offList: EmpInfo[];
    incompleteList: EmpInfo[];
    notCheckedInList: EmpInfo[];
  };
  month: {
    month: string;
    dailyChart: Array<{
      date: string;
      fullDate: string;
      present: number;
      late: number;
      absent: number;
      off: number;
      presentList: EmpInfo[];
      lateList: EmpInfo[];
      absentList: EmpInfo[];
      offList: EmpInfo[];
      incompleteList: EmpInfo[];
    }>;
  };
  rankings: {
    topLate: Array<{ fullName: string; username: string; late: number }>;
    topAbsent: Array<{ fullName: string; username: string; absent: number }>;
    topWarnings: Array<{ fullName: string; username: string; warnings: number }>;
  };
};

const STAT_CONFIG: {
  key: string;
  label: string;
  icon: string;
  colorClass: string;
  listKey?: keyof DashboardData["today"];
  valueKey: keyof DashboardData["today"];
}[] = [
  { key: "total", label: "Tổng NV", icon: "👥", colorClass: "stat--default", valueKey: "totalEmployees" },
  { key: "present", label: "Đi làm", icon: "✅", colorClass: "stat--success", valueKey: "present", listKey: "presentList" },
  { key: "late", label: "Đi muộn", icon: "⏰", colorClass: "stat--danger", valueKey: "late", listKey: "lateList" },
  { key: "absent", label: "Vắng mặt", icon: "❌", colorClass: "stat--danger", valueKey: "absent", listKey: "absentList" },
  { key: "off", label: "Nghỉ phép", icon: "🏖️", colorClass: "stat--info", valueKey: "off", listKey: "offList" },
  { key: "incomplete", label: "Chưa checkout", icon: "⚠️", colorClass: "stat--warning", valueKey: "incomplete", listKey: "incompleteList" },
  { key: "notCheckedIn", label: "Chưa checkin", icon: "🔘", colorClass: "stat--muted", valueKey: "notCheckedIn", listKey: "notCheckedInList" },
];

function StatCards({ today, openStat, onToggle }: { today: DashboardData["today"]; openStat: string | null; onToggle: (k: string) => void }) {
  return (
    <div className="dash-stats">
      {STAT_CONFIG.map((s) => {
        const value = today[s.valueKey] as number;
        const list = s.listKey ? (today[s.listKey] as EmpInfo[]) : undefined;
        const clickable = list && list.length > 0;
        const isOpen = openStat === s.key;
        return (
          <div
            key={s.key}
            className={`dash-stat ${s.colorClass}${clickable ? " clickable" : ""}${isOpen ? " open" : ""}`}
            onClick={() => clickable && onToggle(s.key)}
          >
            <span className="dash-stat__icon">{s.icon}</span>
            <span className="dash-stat__value">{value}</span>
            <span className="dash-stat__label">{s.label}</span>
            {isOpen && list && list.length > 0 && (
              <div className="stat-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="stat-dropdown-header">
                  <strong>{s.label} ({list.length})</strong>
                  <button className="stat-dropdown-close" onClick={() => onToggle(s.key)}>✕</button>
                </div>
                <ul className="stat-dropdown-list">
                  {list.map((e) => <li key={e.username}>{e.username}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ data, maxVal, month }: { data: DashboardData["month"]["dailyChart"]; maxVal: number; month: string }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build full list of days in the month
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dataMap = new Map(data.map((d) => [d.fullDate, d]));
  const emptyDay = { present: 0, late: 0, absent: 0, off: 0, presentList: [], lateList: [], absentList: [], offList: [], incompleteList: [] } as const;

  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const fullDate = `${month}-${day}`;
    const existing = dataMap.get(fullDate);
    return existing ?? { date: day, fullDate, ...emptyDay };
  });

  const selectedData = selectedDay ? allDays.find((d) => d.fullDate === selectedDay) : null;

  return (
    <>
      <div className="dash-chart-scroll">
        <div className="dash-chart-bars">
          {allDays.map((d) => {
            const total = d.present + d.absent + d.off;
            const h = total > 0 ? Math.round((total / Math.max(maxVal, 1)) * 120) : 0;
            const lateH = d.late > 0 ? Math.max(4, Math.round((d.late / Math.max(total, 1)) * h)) : 0;
            const isSelected = selectedDay === d.fullDate;
            const hasData = total > 0;
            return (
              <div
                key={d.fullDate}
                className={`dash-chart-col${isSelected ? " selected" : ""}${selectedDay && !isSelected ? " dimmed" : ""}${!hasData ? " empty" : ""}`}
                onClick={() => hasData ? setSelectedDay((prev) => (prev === d.fullDate ? null : d.fullDate)) : undefined}
              >
                <div className="dash-chart-bar" style={{ height: h || 2 }}>
                  {h > 0 && lateH > 0 && <div className="dash-chart-bar__late" style={{ height: lateH }} />}
                  {h > 0 && <div className="dash-chart-bar__present" style={{ flex: 1 }} />}
                  {h === 0 && <div className="dash-chart-bar__empty" style={{ flex: 1 }} />}
                </div>
                <span className="dash-chart-label">{d.date}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="dash-chart-legend">
        <span><span className="legend-dot" style={{ background: "var(--primary)" }} /> Đi làm</span>
        <span><span className="legend-dot" style={{ background: "var(--danger)" }} /> Đi muộn</span>
      </div>
      {selectedData && (
        <div className="chart-day-detail">
          <div className="chart-day-detail-header">
            <strong>📅 Ngày {selectedData.fullDate}</strong>
            <button className="stat-dropdown-close" onClick={() => setSelectedDay(null)}>✕</button>
          </div>
          <div className="chart-day-detail-grid">
            {([
              { list: selectedData.lateList, label: "Đi muộn", cls: "danger" },
              { list: selectedData.absentList, label: "Vắng mặt", cls: "danger" },
              { list: selectedData.offList, label: "Nghỉ phép", cls: "info" },
              { list: selectedData.incompleteList, label: "Chưa checkout", cls: "warning" },
            ] as const).map(
              (col) =>
                col.list.length > 0 && (
                  <div className="chart-day-detail-col" key={col.label}>
                    <div className={`chart-day-detail-label chart-day-detail-label--${col.cls}`}>
                      {col.label} ({col.list.length})
                    </div>
                    <ul>
                      {col.list.map((e) => (
                        <li key={e.username}>{e.username}</li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RankingTable({ title, icon, rows, valueKey, valueLabel }: {
  title: string;
  icon: string;
  rows: Array<{ fullName: string; username: string; [k: string]: unknown }>;
  valueKey: string;
  valueLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="dash-ranking-title">{icon} {title}</h4>
      <table className="dash-ranking-table">
        <thead>
          <tr><th>#</th><th>Nhân viên</th><th>{valueLabel}</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.username}>
              <td className="dash-ranking-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
              <td>{r.username}</td>
              <td className="dash-ranking-value">{r[valueKey] as number}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [openStat, setOpenStat] = useState<string | null>(null);

  function toggleStat(key: string) {
    setOpenStat((prev) => (prev === key ? null : key));
  }

  useEffect(() => {
    apiJson<DashboardData>("/api/admin/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Lỗi tải dashboard"));
  }, []);

  if (error) return <div className="card"><ErrorMessage error={error} /></div>;
  if (!data) return <div className="card dash-loading">Đang tải...</div>;

  const t = data.today;
  const maxDaily = Math.max(...data.month.dailyChart.map((d) => d.present + d.absent + d.off), 1);

  return (
    <div className="dash">
      <div className="card">
        <h3 className="dash-section-title">📊 Tổng quan hôm nay — {t.date}</h3>
        <StatCards today={t} openStat={openStat} onToggle={toggleStat} />
      </div>

      <div className="card">
        <h3 className="dash-section-title">📈 Biểu đồ tháng {data.month.month}</h3>
        <BarChart data={data.month.dailyChart} maxVal={maxDaily} month={data.month.month} />
      </div>

      <div className="dash-rankings">
        <div className="card">
          <RankingTable title="Top đi muộn" icon="⏰" rows={data.rankings.topLate} valueKey="late" valueLabel="Số lần" />
        </div>
        <div className="card">
          <RankingTable title="Top vắng mặt" icon="❌" rows={data.rankings.topAbsent} valueKey="absent" valueLabel="Số lần" />
        </div>
        <div className="card">
          <RankingTable title="Top cảnh báo" icon="⚠️" rows={data.rankings.topWarnings} valueKey="warnings" valueLabel="Số lần" />
        </div>
      </div>
    </div>
  );
}
