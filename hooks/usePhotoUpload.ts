import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { isApiError } from "@/lib/api";
import { isRemoteUrl, uploadImage } from "@/lib/upload";

export type PhotoEntry = {
  /** Local file URI (or remote URL for photos that came from the server). */
  localUri: string;
  /** Remote URL once uploaded; null while uploading; equals localUri if deferred. */
  url: string | null;
  /** True when the upload failed for lack of connectivity and will happen at sync. */
  deferred: boolean;
};

type Options = {
  max?: number;
  /**
   * When true, an offline capture keeps the local URI and lets the sync queue
   * upload it later. Use for offline-first listings. When false (online-only
   * flows like generic products), a failed upload removes the photo.
   */
  allowDeferred?: boolean;
  initial?: string[];
  /** Image quality 0–1 passed to the camera. */
  quality?: number;
};

/**
 * Camera capture + upload state shared by every photo picker in the app.
 * Returns the URL list to persist: remote URLs where uploaded, local URIs for
 * deferred ones (only when `allowDeferred`).
 */
export function usePhotoUpload({ max = 4, allowDeferred = false, initial = [], quality = 0.7 }: Options = {}) {
  const [photos, setPhotos] = useState<PhotoEntry[]>(() =>
    initial.map((u) => ({ localUri: u, url: u, deferred: !isRemoteUrl(u) })),
  );
  const opening = useRef(false);

  const uploading = photos.some((p) => p.url === null);
  const canAddMore = photos.length < max;

  const remove = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const capture = useCallback(async (): Promise<void> => {
    if (opening.current) return; // double-tap guard while the camera opens
    if (photos.length >= max) {
      Alert.alert(`You can add up to ${max} photos`);
      return;
    }
    opening.current = true;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera needed", "Allow camera access in Settings to add photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality, mediaTypes: ["images"] });
      if (result.canceled || !result.assets?.[0]) return;
      const localUri = result.assets[0].uri;

      setPhotos((prev) => [...prev, { localUri, url: null, deferred: false }]);
      try {
        const url = await uploadImage(localUri);
        setPhotos((prev) => prev.map((p) => (p.localUri === localUri ? { ...p, url, deferred: false } : p)));
      } catch (err) {
        const offline = isApiError(err) && err.isNetworkError;
        if (offline && allowDeferred) {
          setPhotos((prev) => prev.map((p) => (p.localUri === localUri ? { ...p, url: localUri, deferred: true } : p)));
        } else {
          setPhotos((prev) => prev.filter((p) => p.localUri !== localUri));
          Alert.alert(
            "Photo not uploaded",
            offline ? "You're offline. Connect to the internet and try again." : "The photo didn't go through. Please try again.",
          );
        }
      }
    } finally {
      opening.current = false;
    }
  }, [photos.length, max, quality, allowDeferred]);

  /** URLs ready to persist (remote where possible, local where deferred). */
  const urls = photos.flatMap((p) => (p.url ? [p.url] : []));
  const hasDeferred = photos.some((p) => p.deferred);

  return { photos, urls, uploading, canAddMore, hasDeferred, capture, remove, setPhotos };
}
