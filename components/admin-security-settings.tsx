"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/client-api";

type SecuritySettings = {
  enforceSingleDevicePerAccount: boolean;
  enforceSingleAccountPerDeviceIp: boolean;
  blockMobilePhoneLogin: boolean;
};

const DEFAULT_SETTINGS: SecuritySettings = {
  enforceSingleDevicePerAccount: true,
  enforceSingleAccountPerDeviceIp: true,
  blockMobilePhoneLogin: true,
};

export default function AdminSecuritySettings() {
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const data = await apiJson<SecuritySettings>("/api/admin/security-settings");
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được cài đặt bảo mật");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await apiJson<SecuritySettings>("/api/admin/security-settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(data);
      setMessage("Đã lưu cài đặt giới hạn đăng nhập");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu cài đặt thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Cài đặt giới hạn đăng nhập</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ minWidth: 360 }}>
          <input
            type="checkbox"
            checked={settings.enforceSingleDevicePerAccount}
            onChange={(e) => setSettings((s) => ({ ...s, enforceSingleDevicePerAccount: e.target.checked }))}
          />{" "}
          Mỗi tài khoản chỉ được đăng nhập đồng thời trên 1 thiết bị
        </label>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <label style={{ minWidth: 360 }}>
          <input
            type="checkbox"
            checked={settings.enforceSingleAccountPerDeviceIp}
            onChange={(e) => setSettings((s) => ({ ...s, enforceSingleAccountPerDeviceIp: e.target.checked }))}
          />{" "}
          1 thiết bị/IP chỉ đăng nhập 1 tài khoản trong 10 phút
        </label>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ minWidth: 360 }}>
          <input type="checkbox" checked={settings.blockMobilePhoneLogin} onChange={(e) => setSettings((s) => ({ ...s, blockMobilePhoneLogin: e.target.checked }))} />{" "}
          Chặn đăng nhập từ điện thoại
        </label>
      </div>
      <button disabled={loading} onClick={save}>
        {loading ? "Đang lưu..." : "Lưu cài đặt"}
      </button>
      {message && <p style={{ color: "var(--primary)" }}>{message}</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
