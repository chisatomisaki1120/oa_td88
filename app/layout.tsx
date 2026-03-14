import type { Metadata } from "next";
import { ErrorBoundary } from "@/components/ui-feedback";
import ThemeProvider from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OA TD88 - Chấm công",
  description: "Hệ thống chấm công nội bộ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("oa_theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();window.addEventListener("error",function(e){if(e.message&&(e.message.indexOf("Loading chunk")!==-1||e.message.indexOf("ChunkLoadError")!==-1||e.message.indexOf("Failed to fetch dynamically imported module")!==-1)){window.location.reload()}},true)`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
