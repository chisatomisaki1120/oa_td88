"use client";

import { FormEvent, useState } from "react";
import { apiJson } from "@/lib/client-api";

export default function SuperadminClosure() {
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiJson("/api/superadmin/monthly-closure/reopen", {
        method: "POST",
        body: JSON.stringify({ month, note }),
      });
      setMessage("Đã mở khóa tháng thành công");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mở khóa thất bại");
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Mở khóa tháng (SuperAdmin)</h3>
      <form className="row" onSubmit={onSubmit}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        <input placeholder="Lý do mở khóa" value={note} onChange={(e) => setNote(e.target.value)} style={{ minWidth: 280 }} />
        <button type="submit">Mở khóa tháng</button>
      </form>
      {message && <p style={{ color: "#047857" }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
    </div>
  );
}
