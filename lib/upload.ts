import * as FileSystem from "expo-file-system/legacy";
import { API_BASE, ApiError } from "./api";
import { getToken } from "./auth";

const TIMEOUT_MS = 60_000;

/** True for a URL that is already hosted (CDN / R2 / Cloudinary), false for a local file. */
export function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function mimeTypeFor(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    default: return "image/jpeg";
  }
}

/**
 * Uploads a local image to the API and returns its public URL.
 * Throws ApiError(status 0) when the device is offline so callers can decide
 * whether to defer the upload to the sync queue.
 */
export async function uploadImage(uri: string): Promise<string> {
  if (isRemoteUrl(uri)) return uri;

  const token = await getToken();
  if (!token) throw new ApiError("Not signed in", 401);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError("Upload timed out", 0)), TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      FileSystem.uploadAsync(`${API_BASE}/vendor/upload`, uri, {
        fieldName: "file",
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        mimeType: mimeTypeFor(uri),
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        throw new ApiError("Network request failed", 0);
      }),
      timeout,
    ]);

    let data: { url?: string; error?: string } = {};
    try {
      data = JSON.parse(result.body) as { url?: string; error?: string };
    } catch {
      /* non-JSON body — handled below */
    }
    if (result.status < 200 || result.status >= 300 || !data.url) {
      throw new ApiError(data.error ?? "Upload failed", result.status || 500, data);
    }
    return data.url;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Uploads every local URI in the list, passing through anything already
 * remote. Order is preserved. Fails fast on the first error so the caller's
 * queue item stays unsynced and is retried whole.
 */
export async function uploadLocalPhotos(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) out.push(await uploadImage(uri));
  return out;
}
