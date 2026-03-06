export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const part = document.cookie.split("; ").find((item) => item.startsWith("oa_csrf="));
  return part ? decodeURIComponent(part.split("=")[1]) : "";
}

async function refreshCsrfToken() {
  await fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
  }).catch(() => undefined);
}

export async function ensureCsrf() {
  if (!getCsrfToken()) await refreshCsrfToken();
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();

  if (method !== "GET" && !getCsrfToken()) {
    await refreshCsrfToken();
  }

  const doRequest = async () => {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(method !== "GET" ? { "x-csrf-token": getCsrfToken() } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  let { response, data } = await doRequest();

  if (method !== "GET" && data?.message === "Invalid CSRF token") {
    await refreshCsrfToken();
    ({ response, data } = await doRequest());
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.message ?? "Request failed");
  }
  return data.data as T;
}
