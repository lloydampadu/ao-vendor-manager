import Constants from "expo-constants";
import { getToken, notifyUnauthorized } from "./auth";
import { createLogger } from "./logger";
import { ApiError, extractMessage } from "./api-error";

export { ApiError, isApiError, errorMessage, failureAction } from "./api-error";

const log = createLogger("api");

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 15_000;

/** Sent on every request so the admin control room can see which app build each vendor runs. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "dev";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await getToken();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-App-Version": APP_VERSION,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ApiError("Request timed out", 0);
      }
      throw new ApiError("Network request failed", 0);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      if (res.status === 401 && token) {
        log.warn("401 with a stored token — signing out", undefined, { path });
        notifyUnauthorized();
      }
      throw new ApiError(extractMessage(body, res.status), res.status, body);
    }
    return body as T;
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

// ─── Shared API types ────────────────────────────────────────────────────────

export type ApiVendor = {
  id: string;
  name: string | null;
  phone: string;
  categories: string[];
  specialties: string[] | null;
  brands: string[] | null;
  pendingSpecialties?: string[];
  imageUrl?: string | null;
  tier?: string;
  fulfilledCount?: number;
};

export type ApiTyreListing = {
  id: string;
  width: number;
  height: number;
  diameter: number;
  brand: string | null;
  model: string | null;
  condition: string;
  priceGhs: number;
  photos: string[];
  inStock: boolean;
  /** Catalog size this listing is linked to, or null/absent when unlinked. */
  tyreSizeId?: string | null;
  /** Only present for in-stock, New, linked listings priced above the band. */
  priceAdvice?: { lowestGhs: number; maxGhs: number } | null;
  /** Set when the vendor proposed this tyre for the catalog; it waits for an admin while tyreSizeId is null. */
  proposedAt?: string | null;
  updatedAt: string;
};

export type ApiLightListing = {
  id: string;
  lightType: string;
  side: string;
  make: string | null;
  model: string | null;
  year: string | null;
  condition: string;
  priceGhs: number;
  photos: string[];
  inStock: boolean;
  updatedAt: string;
};

export type ApiProduct = {
  id: string;
  name: string;
  priceGhs: number;
  condition: "NEW" | "USED" | "REFURBISHED";
  description?: string | null;
  photos: string[];
  inStock: boolean;
  category?: string | null;
  engineCapacity?: string | null;
  createdAt: string;
};

export type ApiTyreCatalogModel = { name: string; slug: string; type: string | null };
export type ApiTyreCatalogBrand = {
  brandName: string;
  brandSlug: string;
  tier: string;
  models: ApiTyreCatalogModel[];
};

export type ApiTyreSizeBrand = {
  brandName: string;
  brandSlug: string;
  tier: string;
  models: { modelId: string; modelName: string; sizeId: string }[];
};

// ─── Endpoint groups ─────────────────────────────────────────────────────────

export const vendorAuthApi = {
  sendOtp: (phone: string) => api.post<{ ok: true }>("/vendor-auth/otp/send", { phone }),
  verifyOtp: (phone: string, code: string) =>
    api.post<{ token: string; vendor: ApiVendor }>("/vendor-auth/otp/verify", { phone, code }),
  me: () => api.get<{ vendor: ApiVendor }>("/vendor-auth/me"),
  setSpecialties: (specialties: string[]) =>
    api.patch<{ specialties: string[]; categories: string[] }>("/vendor-auth/specialties", { specialties }),
  setBrands: (brands: string[]) => api.patch<{ brands: string[] }>("/vendor-auth/brands", { brands }),
  setImage: (imageUrl: string) => api.patch<{ imageUrl: string }>("/vendor-auth/image", { imageUrl }),
  registerPushToken: (token: string) => api.put<{ ok: true }>("/vendor-auth/push-token", { token }),
};

export const productsApi = {
  getAll: () => api.get<{ products: ApiProduct[] }>("/vendor/products"),
  create: (body: unknown) => api.post<{ product: ApiProduct }>("/vendor/products", body),
  update: (id: string, body: unknown) => api.patch<{ product: ApiProduct }>(`/vendor/products/${id}`, body),
  delete: (id: string) => api.delete<{ ok: true }>(`/vendor/products/${id}`),
};

export const tyreListingsApi = {
  getAll: () => api.get<{ listings: ApiTyreListing[] }>("/vendor/tyre-listings"),
  create: (body: unknown) => api.post<{ listing: ApiTyreListing }>("/vendor/tyre-listings", body),
  update: (id: string, body: unknown) => api.patch<{ listing: ApiTyreListing }>(`/vendor/tyre-listings/${id}`, body),
  delete: (id: string) => api.delete<{ ok: true }>(`/vendor/tyre-listings/${id}`),
};

export const lightListingsApi = {
  getAll: () => api.get<{ listings: ApiLightListing[] }>("/vendor/light-listings"),
  create: (body: unknown) => api.post<{ listing: ApiLightListing }>("/vendor/light-listings", body),
  update: (id: string, body: unknown) => api.patch<{ listing: ApiLightListing }>(`/vendor/light-listings/${id}`, body),
  delete: (id: string) => api.delete<{ ok: true }>(`/vendor/light-listings/${id}`),
};

export const tyreCatalogApi = {
  get: () => api.get<{ brands: ApiTyreCatalogBrand[] }>("/tyres/catalog"),
  /** Catalog brands and models that exist in one size. `sizeId` identifies the catalog size row. */
  modelsForSize: (w: number, h: number, d: number) =>
    api.get<{ brands: ApiTyreSizeBrand[] }>(`/tyres/sizes/${w}/${h}/${d}`),
};

export const vehicleApi = {
  getMakes: () => api.get<{ makes: string[] }>("/vehicles/makes"),
  getModels: (make: string) => api.get<{ models: string[] }>(`/vehicles/models?make=${encodeURIComponent(make)}`),
  getVariants: (make: string, model: string, year: string) =>
    api.get<{ variants: string[] }>(
      `/vehicles/variants?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`,
    ),
};

export const specialtyRequestsApi = {
  submit: (specialties: string[], category?: string) =>
    api.post<{ requests: { id: string; specialty: string; status: string }[] }>(
      "/vendor/specialty-requests",
      { specialties, category },
    ),
};
