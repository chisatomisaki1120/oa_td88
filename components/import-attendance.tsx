"use client";

import { useState, useRef } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";

type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
  results: Array<{ row: number; username: string; workDate: string; error?: string }>;
};

export default function ImportAttendance() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Chọn file trước"); return; }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await ensureCsrf();
      const res = await fetch("/api/admin/attendance/import", {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      setResult(data.data);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import chấm công từ file</h3>
      <p className="small" style={{ margin: "0 0 8px" }}>
        Hỗ trợ CSV, XLS, XLSX. Cần cột: username/mã NV, date/ngày. Tùy chọn: check_in/giờ vào, check_out/giờ ra.
      </p>
      <div className="row">
        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" />
        <button onClick={handleImport} disabled={loading}>
          {loading ? "Đang import..." : "Import"}
        </button>
      </div>
      {error && <ErrorMessage error={error} />}
      {result && (
        <div style={{ marginTop: 12 }}>
          <SuccessMessage message={`Import thành công ${result.imported}/${result.total} dòng. Bỏ qua: ${result.skipped}`} />
          {result.results.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="small" style={{ cursor: "pointer" }}>Xem {result.results.length} dòng lỗi</summary>
              <table style={{ marginTop: 8, fontSize: 13 }}>
                <thead>
                  <tr><th>Dòng</th><th>Username</th><th>Ngày</th><th>Lỗi</th></tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.row}</td>
                      <td>{r.username}</td>
                      <td>{r.workDate}</td>
                      <td style={{ color: "var(--danger)" }}>{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
