export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const part = document.cookie.split("; ").find((item) => item.startsWith("oa_csrf="));
  return part ? decodeURIComponent(part.split("=")[1]) : "";
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.method && init.method !== "GET" ? { "x-csrf-token": getCsrfToken() } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "Request failed");
  }
  return data.data as T;
}
