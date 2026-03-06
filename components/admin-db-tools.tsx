"use client";

import { FormEvent, useState } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";

export default function AdminDbTools() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function exportJson() {
    window.open("/api/admin/db/export.json", "_blank");
  }

  async function importJson(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedFile) {
      setError("Vui lòng chọn file JSON để nhập");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setLoadingImport(true);
    try {
      await ensureCsrf();
      const response = await fetch("/api/admin/db/import.json", {
        method: "POST",
        headers: {
          "x-csrf-token": getCsrfToken(),
        },
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        data?: { backupPath?: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Import thất bại");
      }

      setMessage(`Đã nhập DB thành công${payload.data?.backupPath ? ` (backup: ${payload.data.backupPath})` : ""}. Nên restart tiến trình app nếu đang chạy production.`);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setLoadingImport(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Công cụ dữ liệu (DB JSON)</h3>
      <p className="small" style={{ marginTop: 0 }}>
        Xuất/Nhập toàn bộ cơ sở dữ liệu qua JSON. Trước khi nhập, hệ thống tự tạo backup file `.db`.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" onClick={exportJson}>
          Xuất DB JSON
        </button>
      </div>

      <form onSubmit={importJson} className="row">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        />
        <button type="submit" className="danger" disabled={loadingImport}>
          {loadingImport ? "Đang nhập..." : "Nhập DB JSON"}
        </button>
      </form>

      {message && <p style={{ color: "#047857" }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}
