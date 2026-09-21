import * as SecureStore from "expo-secure-store";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 60_000;

export async function uploadImage(uri: string, folder = "vendor"): Promise<string> {
  const token = await SecureStore.getItemAsync("vendor_token");
  if (!token) throw new Error("Not authenticated");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("file", { uri, type: "image/jpeg", name: "photo.jpg" } as unknown as Blob);

    const res = await fetch(`${BASE}/vendor/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });

    const data = await res.json() as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
    return data.url;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Upload timed out — check your connection");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
