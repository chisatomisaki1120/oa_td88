"use client";

import { useState } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";

export default function AdminDbTools() {
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function exportJson() {
    window.open("/api/admin/db/export.json", "_blank");
  }

  async function backupDb() {
    setLoadingBackup(true);
    setError("");
    setMessage("");
    try {
      await ensureCsrf();
      const res = await fetch("/api/admin/db/backup", {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; data?: { backupPath?: string } };
      if (!res.ok || !payload.ok) throw new Error(payload.message ?? "Backup thất bại");
      setMessage(`Backup thành công: ${payload.data?.backupPath ?? ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup thất bại");
    } finally {
      setLoadingBackup(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Xuất dữ liệu</h3>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <a href="/api/admin/users/export.xlsx" download className="btn secondary">
            Xuất Excel nhân sự
          </a>
          <button type="button" onClick={exportJson} className="secondary">
            Xuất DB JSON
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Backup cơ sở dữ liệu</h3>
        <p className="small" style={{ marginTop: 0 }}>
          Tạo bản sao lưu .db thủ công. Hệ thống giữ tối đa 7 bản gần nhất, xóa cũ tự động.
        </p>
        <button type="button" onClick={backupDb} disabled={loadingBackup}>
          {loadingBackup ? "Đang backup..." : "Backup DB ngay"}
        </button>
      </div>

      {message && <SuccessMessage message={message} />}
      {error && <ErrorMessage error={error} />}
    </>
  );
}
