"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/client-api";

type SessionMe = {
  user: {
    role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  } | null;
  csrfToken: string;
};

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    apiJson<SessionMe>("/api/auth/me")
      .then((data) => {
        if (!data.user) return;
        if (data.user.role === "EMPLOYEE") router.replace("/employee/today");
        else router.replace("/admin/attendance");
      })
      .catch(() => undefined);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const me = await apiJson<SessionMe>("/api/auth/me");
      if (me.user?.role === "EMPLOYEE") router.push("/employee/today");
      else router.push("/admin/attendance");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 460, paddingTop: 72 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Đăng nhập hệ thống</h1>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label>Tên đăng nhập</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Mật khẩu</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%" }} />
          </div>
          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
