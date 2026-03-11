"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";
import { roleLabel } from "@/lib/display-labels";

type Stats = {
  month: string;
  totalDays: number;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  offDays: number;
  deductedDays: number;
  totalWorkedMinutes: number;
  warningCount: number;
  allowedOffDaysPerMonth: number;
};

type Profile = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  department: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  workStartTime: string | null;
  workEndTime: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  workMode: "ONLINE" | "OFFLINE";
  allowedOffDaysPerMonth: number;
  stats: Stats;
};

export default function AccountProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    setError("");
    try {
      const data = await apiJson<Profile>("/api/account/profile");
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thông tin tài khoản");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError("");
    setMessage("");

    try {
      await apiJson("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: profile.fullName,
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          address: profile.address ?? "",
          department: profile.department ?? "",
          workStartTime: profile.workStartTime ?? "",
          workEndTime: profile.workEndTime ?? "",
          lateGraceMinutes: profile.lateGraceMinutes,
          earlyLeaveGraceMinutes: profile.earlyLeaveGraceMinutes,
          workMode: profile.workMode,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Cập nhật tài khoản thành công");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
    }
  }

  if (!profile) {
    return <div className="card">Đang tải...</div>;
  }

  const isEmployee = profile.role === "EMPLOYEE";

  return (
    <>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Tài khoản của tôi</h3>
      <form onSubmit={saveProfile}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={profile.username} disabled title="Tên đăng nhập" />
          <input value={roleLabel(profile.role)} disabled title="Vai trò" />
          {isEmployee ? (
            <input value={profile.workMode} disabled title="Hình thức làm việc" />
          ) : (
            <select
              value={profile.workMode}
              onChange={(e) => setProfile((p) => (p ? { ...p, workMode: e.target.value as "ONLINE" | "OFFLINE" } : p))}
              title="Hình thức làm việc"
            >
              <option value="OFFLINE">Offline</option>
              <option value="ONLINE">Online</option>
            </select>
          )}
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            value={profile.fullName}
            onChange={(e) => setProfile((p) => (p ? { ...p, fullName: e.target.value } : p))}
            placeholder="Họ tên"
            required
          />
          <input
            value={profile.department ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, department: e.target.value } : p))}
            placeholder="Chức vụ"
          />
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="tel"
            value={profile.phone ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, phone: e.target.value } : p))}
            placeholder="Số điện thoại"
          />
          <input
            type="email"
            value={profile.email ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, email: e.target.value } : p))}
            placeholder="Email"
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input
            value={profile.address ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, address: e.target.value } : p))}
            placeholder="Địa chỉ"
            style={{ width: "100%" }}
          />
        </div>

        {isEmployee ? (
          <div className="row" style={{ marginBottom: 10, gap: 16 }}>
            <span className="small">Giờ làm: <strong>{profile.workStartTime ?? "-"} – {profile.workEndTime ?? "-"}</strong></span>
            <span className="small">Trễ cho phép: <strong>{profile.lateGraceMinutes} phút</strong></span>
            <span className="small">Về sớm cho phép: <strong>{profile.earlyLeaveGraceMinutes} phút</strong></span>
          </div>
        ) : (
          <div className="row" style={{ marginBottom: 10 }}>
            <input
              type="time"
              value={profile.workStartTime ?? ""}
              onChange={(e) => setProfile((p) => (p ? { ...p, workStartTime: e.target.value } : p))}
              title="Giờ bắt đầu"
            />
            <input
              type="time"
              value={profile.workEndTime ?? ""}
              onChange={(e) => setProfile((p) => (p ? { ...p, workEndTime: e.target.value } : p))}
              title="Giờ kết thúc"
            />
            <input
              type="number"
              value={profile.lateGraceMinutes}
              onChange={(e) => setProfile((p) => (p ? { ...p, lateGraceMinutes: Number(e.target.value) } : p))}
              style={{ width: 90 }}
              placeholder="Phút trễ"
              title="Phút trễ cho phép"
            />
            <input
              type="number"
              value={profile.earlyLeaveGraceMinutes}
              onChange={(e) => setProfile((p) => (p ? { ...p, earlyLeaveGraceMinutes: Number(e.target.value) } : p))}
              style={{ width: 90 }}
              placeholder="Phút về sớm"
              title="Phút về sớm cho phép"
            />
          </div>
        )}
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Mật khẩu hiện tại (nếu đổi mật khẩu)"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mật khẩu mới"
          />
        </div>

        <button type="submit">Lưu thay đổi</button>
      </form>
      {message && <p style={{ color: "var(--primary)" }}>{message}</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>

    {profile.stats && (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tổng hợp tháng {profile.stats.month}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <div><span className="small">Đi làm đúng giờ</span><br /><strong>{profile.stats.presentDays}</strong> ngày</div>
          <div><span className="small">Đi muộn</span><br /><strong style={{ color: "var(--danger)" }}>{profile.stats.lateDays}</strong> ngày</div>
          <div><span className="small">Về sớm</span><br /><strong>{profile.stats.earlyLeaveDays}</strong> ngày</div>
          <div><span className="small">Vắng mặt</span><br /><strong style={{ color: "var(--danger)" }}>{profile.stats.absentDays}</strong> ngày</div>
          <div><span className="small">Nghỉ phép</span><br /><strong>{profile.stats.offDays}</strong> / {profile.stats.allowedOffDaysPerMonth} ngày</div>
          <div><span className="small">Nghỉ trừ lương</span><br /><strong style={{ color: profile.stats.deductedDays > 0 ? "#b91c1c" : undefined }}>{profile.stats.deductedDays}</strong> ngày</div>
          <div><span className="small">Tổng giờ làm</span><br /><strong>{Math.floor(profile.stats.totalWorkedMinutes / 60)}h{profile.stats.totalWorkedMinutes % 60}p</strong></div>
          <div><span className="small">Ngày có cảnh báo</span><br /><strong style={{ color: profile.stats.warningCount > 0 ? "#b91c1c" : undefined }}>{profile.stats.warningCount}</strong> ngày</div>
        </div>
      </div>
    )}
    </>
  );
}
