"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/client-api";
import { ErrorMessage } from "@/components/ui-feedback";

type SessionMe = {
  user: {
    role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
  } | null;
  csrfToken: string;
};

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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

  function getClientDeviceSignal() {
    if (typeof window === "undefined") return undefined;

    const nav = window.navigator as Navigator & {
      userAgentData?: {
        mobile?: boolean;
      };
    };

    return {
      userAgent: nav.userAgent ?? "",
      platform: nav.platform ?? "",
      maxTouchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0,
      screenWidth: window.screen?.width ?? 0,
      screenHeight: window.screen?.height ?? 0,
      userAgentDataMobile: typeof nav.userAgentData?.mobile === "boolean" ? nav.userAgentData.mobile : undefined,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, rememberMe, clientDevice: getClientDeviceSignal() }),
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
            <label htmlFor="login-username">Tên đăng nhập</label>
            <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ width: "100%" }} autoComplete="username" aria-required="true" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-password">Mật khẩu</label>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%" }} autoComplete="current-password" aria-required="true" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              Ghi nhớ đăng nhập
            </label>
          </div>
          {error && <ErrorMessage error={error} />}
          <button type="submit" disabled={loading} style={{ width: "100%" }} aria-busy={loading}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
