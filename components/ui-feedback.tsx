"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) {
      window.location.reload();
      return { hasError: true, message: "Đang tải lại trang..." };
    }
    return { hasError: true, message: error.message || "Đã xảy ra lỗi không mong muốn" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <h3 style={{ marginTop: 0, color: "var(--danger)" }}>⚠ Đã xảy ra lỗi</h3>
          <p>{this.state.message}</p>
          <button onClick={() => this.setState({ hasError: false, message: "" })}>Thử lại</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return msg.includes("Loading chunk") || msg.includes("ChunkLoadError") || msg.includes("Failed to fetch dynamically imported module") || (msg.includes("Load failed") && error.name === "ChunkLoadError");
}

export function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ color: "var(--danger)", fontSize: 14 }}>
      ⚠ {error}
    </p>
  );
}

export function SuccessMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" style={{ color: "var(--primary)", fontSize: 14 }}>
      ✓ {message}
    </p>
  );
}

export function EmptyState({ message = "Không có dữ liệu" }: { message?: string }) {
  return (
    <tr>
      <td colSpan={99} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
        {message}
      </td>
    </tr>
  );
}
