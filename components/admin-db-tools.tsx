"use client";

import { useEffect, useState } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";

type BackupFile = { name: string; size: number; createdAt: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminDbTools() {
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<"list" | "upload">("list");

  function exportJson() {
    window.open("/api/admin/db/export.json", "_blank");
  }

  async function loadBackups() {
    try {
      const res = await fetch("/api/admin/db/backup");
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { backups?: BackupFile[] } };
      if (payload.ok && payload.data?.backups) {
        setBackups(payload.data.backups);
        if (payload.data.backups.length > 0 && !selectedBackup) {
          setSelectedBackup(payload.data.backups[0].name);
        }
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { loadBackups(); }, []);

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
      loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup thất bại");
    } finally {
      setLoadingBackup(false);
    }
  }

  async function restoreDb() {
    setError("");
    setMessage("");

    if (restoreMode === "upload" && !uploadFile) {
      setError("Vui lòng chọn file .db để khôi phục");
      return;
    }
    if (restoreMode === "list" && !selectedBackup) {
      setError("Vui lòng chọn bản backup để khôi phục");
      return;
    }

    if (!confirm("Bạn có chắc muốn khôi phục database? Dữ liệu hiện tại sẽ bị ghi đè. Hệ thống sẽ tự tạo bản backup trước khi khôi phục.")) {
      return;
    }

    setLoadingRestore(true);
    try {
      await ensureCsrf();
      const formData = new FormData();
      if (restoreMode === "upload" && uploadFile) {
        formData.append("file", uploadFile);
      } else {
        formData.append("backupName", selectedBackup);
      }

      const res = await fetch("/api/admin/db/backup/restore", {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
        body: formData,
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.message ?? "Khôi phục thất bại");
      setMessage("Khôi phục database thành công. Nên restart app nếu đang chạy production.");
      setUploadFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khôi phục thất bại");
    } finally {
      setLoadingRestore(false);
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Khôi phục cơ sở dữ liệu</h3>
        <p className="small" style={{ marginTop: 0 }}>
          Khôi phục từ file backup .db. Hệ thống tự tạo bản backup trước khi khôi phục.
        </p>

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={restoreMode === "list" ? "" : "secondary"}
            onClick={() => setRestoreMode("list")}
            style={{ fontSize: "0.85rem" }}
          >
            Chọn từ danh sách
          </button>
          <button
            type="button"
            className={restoreMode === "upload" ? "" : "secondary"}
            onClick={() => setRestoreMode("upload")}
            style={{ fontSize: "0.85rem" }}
          >
            Upload file .db
          </button>
        </div>

        {restoreMode === "list" && (
          <>
            {backups.length === 0 ? (
              <p className="small" style={{ color: "var(--muted)" }}>Chưa có bản backup nào.</p>
            ) : (
              <select
                value={selectedBackup}
                onChange={(e) => setSelectedBackup(e.target.value)}
                style={{ width: "100%", marginBottom: 8, padding: "6px 8px" }}
              >
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} — {formatSize(b.size)} — {new Date(b.createdAt).toLocaleString("vi-VN")}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        {restoreMode === "upload" && (
          <input
            type="file"
            accept=".db"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            style={{ marginBottom: 8 }}
          />
        )}

        <button
          type="button"
          onClick={restoreDb}
          disabled={loadingRestore}
          className="danger"
          style={{ marginTop: 4 }}
        >
          {loadingRestore ? "Đang khôi phục..." : "Khôi phục DB"}
        </button>
      </div>

      {message && <SuccessMessage message={message} />}
      {error && <ErrorMessage error={error} />}
    </>
  );
}
