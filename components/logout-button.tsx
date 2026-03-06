"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ensureCsrf } from "@/lib/client-api";

function readCookie(name: string) {
  const part = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.split("=")[1]) : "";
}

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onLogout() {
    setLoading(true);
    await ensureCsrf();
    const csrfToken = readCookie("oa_csrf");
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "x-csrf-token": csrfToken,
      },
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="danger" onClick={onLogout} disabled={loading}>
      {loading ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}
