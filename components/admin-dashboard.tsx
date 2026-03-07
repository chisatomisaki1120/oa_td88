"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { ErrorMessage } from "@/components/ui-feedback";

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
  };
  month: {
    month: string;
    dailyChart: Array<{ date: string; present: number; late: number; absent: number; off: number }>;
  };
  rankings: {
    topLate: Array<{ fullName: string; username: string; late: number }>;
    topAbsent: Array<{ fullName: string; username: string; absent: number }>;
    topWarnings: Array<{ fullName: string; username: string; warnings: number }>;
  };
};

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: "center", padding: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div className="small">{label}</div>
    </div>
  );
}

function BarChart({ data, maxVal }: { data: DashboardData["month"]["dailyChart"]; maxVal: number }) {
  if (data.length === 0) return <p className="small">Chưa có dữ liệu</p>;
  const barW = Math.max(12, Math.floor(700 / data.length) - 2);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 150, minWidth: data.length * (barW + 2) }}>
        {data.map((d) => {
          const total = d.present + d.absent + d.off;
          const h = total > 0 ? Math.round((total / Math.max(maxVal, 1)) * 130) : 0;
          const lateH = d.late > 0 ? Math.max(4, Math.round((d.late / Math.max(total, 1)) * h)) : 0;
          return (
            <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: barW }}>
              <div style={{ width: "100%", height: h, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {lateH > 0 && <div style={{ height: lateH, background: "#ef4444", borderRadius: "3px 3px 0 0" }} title={`Muộn: ${d.late}`} />}
                <div style={{ flex: 1, background: "#14b8a6", borderRadius: lateH > 0 ? 0 : "3px 3px 0 0" }} title={`Đi làm: ${d.present}`} />
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{d.date}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12 }}>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#14b8a6", borderRadius: 2 }} /> Đi làm</span>
        <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#ef4444", borderRadius: 2 }} /> Đi muộn</span>
      </div>
    </div>
  );
}

function RankingTable({ title, rows, valueKey, valueLabel }: {
  title: string;
  rows: Array<{ fullName: string; username: string; [k: string]: unknown }>;
  valueKey: string;
  valueLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 style={{ marginTop: 0 }}>{title}</h4>
      <table style={{ fontSize: 13 }}>
        <thead>
          <tr><th>#</th><th>Nhân viên</th><th>{valueLabel}</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.username}>
              <td>{i + 1}</td>
              <td>{r.username}</td>
              <td style={{ color: "#b91c1c", fontWeight: 600 }}>{r[valueKey] as number}</td>
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

  useEffect(() => {
    apiJson<DashboardData>("/api/admin/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Lỗi tải dashboard"));
  }, []);

  if (error) return <div className="card"><ErrorMessage error={error} /></div>;
  if (!data) return <div className="card">Đang tải...</div>;

  const t = data.today;
  const maxDaily = Math.max(...data.month.dailyChart.map((d) => d.present + d.absent + d.off), 1);

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tổng quan hôm nay — {t.date}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          <StatCard label="Tổng NV" value={t.totalEmployees} />
          <StatCard label="Đi làm" value={t.present} color="#047857" />
          <StatCard label="Đi muộn" value={t.late} color="#b91c1c" />
          <StatCard label="Vắng mặt" value={t.absent} color="#b91c1c" />
          <StatCard label="Nghỉ phép" value={t.off} color="#0369a1" />
          <StatCard label="Chưa checkout" value={t.incomplete} color="#a16207" />
          <StatCard label="Chưa checkin" value={t.notCheckedIn} color="#6b7280" />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Biểu đồ tháng {data.month.month}</h3>
        <BarChart data={data.month.dailyChart} maxVal={maxDaily} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div className="card">
          <RankingTable title="Top đi muộn" rows={data.rankings.topLate} valueKey="late" valueLabel="Số lần" />
        </div>
        <div className="card">
          <RankingTable title="Top vắng mặt" rows={data.rankings.topAbsent} valueKey="absent" valueLabel="Số lần" />
        </div>
        <div className="card">
          <RankingTable title="Top cảnh báo" rows={data.rankings.topWarnings} valueKey="warnings" valueLabel="Số lần" />
        </div>
      </div>
    </>
  );
}
