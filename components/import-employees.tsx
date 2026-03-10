"use client";

import { useState, useRef } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";

type PreviewRow = { row: number; username: string; fullName: string; role: string; department: string; shift: string; status: string; workMode: string; lateGrace: string; earlyLeaveGrace: string; offDays: string; action?: string; error?: string };
type PreviewResult = { mode: "preview"; valid: number; invalid: number; total: number; previews: PreviewRow[]; columns: string[] };
type CommitResult = { mode: "commit"; created: number; updated: number; total: number };

export default function ImportEmployees() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);

  async function doUpload(mode: "preview" | "commit") {
    const file = mode === "commit" ? lastFileRef.current : fileRef.current?.files?.[0];
    if (!file) { setError("Chọn file trước"); return; }
    if (mode === "preview") lastFileRef.current = file;

    setLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    try {
      await ensureCsrf();
      const res = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);

      if (data.data.mode === "preview") {
        setPreview(data.data as PreviewResult);
      } else {
        const result = data.data as CommitResult;
        const parts = [];
        if (result.created > 0) parts.push(`tạo ${result.created} mới`);
        if (result.updated > 0) parts.push(`cập nhật ${result.updated}`);
        setMessage(`Import thành công: ${parts.join(", ")}`);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        lastFileRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import nhân viên từ file</h3>
      <p className="small" style={{ margin: "0 0 8px" }}>
        Hỗ trợ CSV, XLS, XLSX. Cần cột: Tên đăng nhập, Họ và tên. Tùy chọn: Password (mặc định = username), Email, Điện thoại, Chức vụ, Vai trò, Ca làm việc, Trạng thái, Giờ vào, Giờ ra, Phút trễ cho phép, Phút về sớm cho phép, Hình thức, Nghỉ/tháng.
      </p>
      <div className="row">
        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" />
        <button onClick={() => doUpload("preview")} disabled={loading}>
          {loading ? "Đang xử lý..." : "Preview"}
        </button>
      </div>
      {error && <ErrorMessage error={error} />}
      {message && <SuccessMessage message={message} />}

      {preview && (
        <div style={{ marginTop: 12 }}>
          <p>
            <strong>Hợp lệ:</strong> {preview.valid} · <strong>Lỗi:</strong> {preview.invalid} · <strong>Tổng:</strong> {preview.total}
          </p>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Dòng</th><th>Username</th><th>Họ tên</th><th>Vai trò</th><th>Chức vụ</th><th>Ca làm</th><th>Trạng thái</th><th>Hình thức</th><th>Trễ</th><th>Về sớm</th><th>Nghỉ</th><th>Kết quả</th></tr>
              </thead>
              <tbody>
                {preview.previews.map((r) => (
                  <tr key={r.row} style={{ background: r.error ? "#fef2f2" : undefined }}>
                    <td>{r.row}</td>
                    <td>{r.username}</td>
                    <td>{r.fullName}</td>
                    <td>{r.role}</td>
                    <td>{r.department}</td>
                    <td>{r.shift}</td>
                    <td>{r.status}</td>
                    <td>{r.workMode}</td>
                    <td>{r.lateGrace}</td>
                    <td>{r.earlyLeaveGrace}</td>
                    <td>{r.offDays}</td>
                    <td style={{ color: r.error ? "#b91c1c" : r.action === "Cập nhật" ? "#b45309" : "#047857" }}>{r.error ?? r.action ?? "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.valid > 0 && (
            <button onClick={() => doUpload("commit")} disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Đang import..." : `Xác nhận import ${preview.valid} nhân viên`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
