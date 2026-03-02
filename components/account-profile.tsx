"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";

type Profile = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  department: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  workStartTime: string | null;
  workEndTime: string | null;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  workMode: "ONLINE" | "OFFLINE";
  allowedOffDaysPerMonth: number;
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

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Tài khoản của tôi</h3>
      <form onSubmit={saveProfile}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={profile.username} disabled />
          <input value={profile.role} disabled />
          <select
            value={profile.workMode}
            onChange={(e) => setProfile((p) => (p ? { ...p, workMode: e.target.value as "ONLINE" | "OFFLINE" } : p))}
          >
            <option value="OFFLINE">Làm việc Offline</option>
            <option value="ONLINE">Làm việc Online</option>
          </select>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            value={profile.fullName}
            onChange={(e) => setProfile((p) => (p ? { ...p, fullName: e.target.value } : p))}
            placeholder="Họ tên"
            required
          />
          <input
            value={profile.email ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, email: e.target.value } : p))}
            placeholder="Email"
          />
          <input
            value={profile.department ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, department: e.target.value } : p))}
            placeholder="Phòng ban"
          />
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="time"
            value={profile.workStartTime ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, workStartTime: e.target.value } : p))}
          />
          <input
            type="time"
            value={profile.workEndTime ?? ""}
            onChange={(e) => setProfile((p) => (p ? { ...p, workEndTime: e.target.value } : p))}
          />
          <input
            type="number"
            value={profile.lateGraceMinutes}
            onChange={(e) => setProfile((p) => (p ? { ...p, lateGraceMinutes: Number(e.target.value) } : p))}
            style={{ width: 90 }}
            placeholder="Grace vào"
          />
          <input
            type="number"
            value={profile.earlyLeaveGraceMinutes}
            onChange={(e) => setProfile((p) => (p ? { ...p, earlyLeaveGraceMinutes: Number(e.target.value) } : p))}
            style={{ width: 90 }}
            placeholder="Grace ra"
          />
          <span className="badge">Off được phép/tháng: {profile.allowedOffDaysPerMonth}</span>
        </div>
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
      {message && <p style={{ color: "#047857" }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}
