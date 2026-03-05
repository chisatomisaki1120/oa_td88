"use client";

import { useTheme } from "@/components/theme-provider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="secondary"
      style={{ padding: "6px 10px", fontSize: 14 }}
      aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
