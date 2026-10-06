import { create } from "zustand";
import {
  clearToken,
  clearVendor,
  getToken,
  loadVendor,
  saveToken,
  saveVendor,
  setUnauthorizedHandler,
} from "@/lib/auth";
import { isApiError, vendorAuthApi, type ApiVendor } from "@/lib/api";
import { clearAllData } from "@/lib/db";
import { waitForSyncIdle } from "@/store/sync-store";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-store");

export type Vendor = {
  id: string;
  name: string;
  phone: string;
  categories: string[];
  specialties: string[];
  pendingSpecialties: string[];
  brands: string[];
  imageUrl: string | null;
  tier?: string;
  fulfilledCount?: number;
};

/** Normalises the server's nullable fields so screens never null-check arrays. */
export function toVendor(v: ApiVendor): Vendor {
  return {
    id: v.id,
    name: v.name ?? "",
    phone: v.phone,
    categories: v.categories ?? [],
    specialties: v.specialties ?? [],
    pendingSpecialties: v.pendingSpecialties ?? [],
    brands: v.brands ?? [],
    imageUrl: v.imageUrl ?? null,
    tier: v.tier,
    fulfilledCount: v.fulfilledCount,
  };
}

export type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthState = {
  status: AuthStatus;
  vendor: Vendor | null;
  /** Restores the session from secure storage. Resolves as soon as the cached
   *  profile is available; the network refresh continues in the background. */
  hydrate: () => Promise<void>;
  signIn: (token: string, vendor: Vendor) => Promise<void>;
  /** Replace the in-memory + cached profile (after onboarding, photo change, /me refresh). */
  setVendor: (vendor: Vendor) => void;
  /** Re-fetch /vendor-auth/me. Best-effort; a 401 signs out via the API hook. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  vendor: null,

  hydrate: async () => {
    try {
      const token = await getToken();
      if (!token) {
        // Safety net: if a previous sign-out was interrupted, make sure no
        // earlier vendor's data survives into the next session.
        await clearAllData().catch((err) => log.warn("clearAllData on signed-out launch failed", err));
        set({ status: "signedOut", vendor: null });
        return;
      }
      const cachedRaw = await loadVendor();
      if (cachedRaw) {
        try {
          set({ status: "signedIn", vendor: toVendor(JSON.parse(cachedRaw) as ApiVendor) });
          void get().refreshProfile();
          return;
        } catch {
          /* corrupt cache — fall through to a network fetch */
        }
      }
      // First launch after install with a token but no cache: we need the server.
      try {
        const { vendor } = await vendorAuthApi.me();
        const v = toVendor(vendor);
        await saveVendor(v);
        set({ status: "signedIn", vendor: v });
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          await get().signOut();
        } else {
          // Offline with a valid token but no cached profile. Stay signed in
          // with no profile; the navigator shows a retry screen until
          // refreshProfile succeeds.
          set({ status: "signedIn", vendor: null });
        }
      }
    } catch (err) {
      log.error("hydrate failed", err);
      set({ status: "signedOut", vendor: null });
    }
  },

  signIn: async (token, vendor) => {
    await saveToken(token);
    await saveVendor(vendor);
    set({ status: "signedIn", vendor });
  },

  setVendor: (vendor) => {
    void saveVendor(vendor).catch((err) => log.warn("saveVendor failed", err));
    set({ vendor });
  },

  refreshProfile: async () => {
    try {
      const { vendor } = await vendorAuthApi.me();
      get().setVendor(toVendor(vendor));
    } catch (err) {
      // 401 is handled by the unauthorized hook; anything else keeps the cache.
      if (!(isApiError(err) && err.status === 401)) log.warn("refreshProfile failed", err);
    }
  },

  signOut: async () => {
    if (get().status === "signedOut") return;
    set({ status: "signedOut", vendor: null });
    // Let any in-flight sync finish, wipe local data, and only then drop the
    // token — so an interrupted sign-out can never leave another vendor's data
    // behind for the next sign-in (a leftover token just repeats the wipe).
    await waitForSyncIdle().catch(() => {});
    await clearAllData().catch((err) => log.error("clearAllData failed", err));
    await Promise.allSettled([clearToken(), clearVendor()]);
  },
}));

// Any 401 from the API client signs the vendor out from one place.
setUnauthorizedHandler(() => {
  void useAuthStore.getState().signOut();
});
