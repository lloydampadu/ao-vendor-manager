import * as SecureStore from "expo-secure-store";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 15_000;

async function getToken() {
  return SecureStore.getItemAsync("vendor_token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(new Error("Request timed out — check your connection"), { status: 0 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
