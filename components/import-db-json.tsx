"use client";

import { FormEvent, useState } from "react";
import { getCsrfToken, ensureCsrf } from "@/lib/client-api";
import { ErrorMessage, SuccessMessage } from "@/components/ui-feedback";

export default function ImportDbJson() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedFile) {
      setError("Vui lòng chọn file JSON để nhập");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setLoading(true);
    try {
      await ensureCsrf();
      const response = await fetch("/api/admin/db/import.json", {
        method: "POST",
        headers: { "x-csrf-token": getCsrfToken() },
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Import thất bại");
      }

      setMessage("Đã nhập DB thành công. Nên restart tiến trình app nếu đang chạy production.");
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import DB JSON</h3>
      <p className="small" style={{ marginTop: 0 }}>
        Nhập toàn bộ CSDL từ file JSON. Nên backup thủ công trước khi nhập.
      </p>
      <form onSubmit={handleImport} className="row">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Đang import..." : "Import"}
        </button>
      </form>
      {message && <SuccessMessage message={message} />}
      {error && <ErrorMessage error={error} />}
    </div>
  );
}
