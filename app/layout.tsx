import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OA TD88 - Chấm công",
  description: "Hệ thống chấm công nội bộ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
