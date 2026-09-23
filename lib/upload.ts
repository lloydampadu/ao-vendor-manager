import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 60_000;

export async function uploadImage(uri: string): Promise<string> {
  const token = await SecureStore.getItemAsync("vendor_token");
  if (!token) throw new Error("Not authenticated");

  const uploadPromise = FileSystem.uploadAsync(`${BASE}/vendor/upload`, uri, {
    fieldName: "file",
    httpMethod: "POST",
    uploadType: 1 as FileSystem.FileSystemUploadType, // 1 = MULTIPART
    mimeType: "image/jpeg",
    headers: { Authorization: `Bearer ${token}` },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out — check your connection")), TIMEOUT_MS),
  );

  const result = await Promise.race([uploadPromise, timeoutPromise]);
  const data = JSON.parse(result.body) as { url?: string; error?: string };
  if (result.status < 200 || result.status >= 300 || !data.url) {
    throw new Error(data.error ?? "Upload failed");
  }
  return data.url;
}
