import { create } from "zustand";
import { saveToken, clearToken, saveVendor, clearVendor } from "@/lib/auth";

export type Vendor = { id: string; name: string; phone: string; categories: string[] };

type AuthState = {
  vendor: Vendor | null;
  token: string | null;
  setAuth: (token: string, vendor: Vendor) => Promise<void>;
  setVendor: (vendor: Vendor) => void;
  clearAuth: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  vendor: null,
  token: null,
  setAuth: async (token, vendor) => {
    await saveToken(token);
    await saveVendor(vendor);
    set({ token, vendor });
  },
  setVendor: (vendor) => {
    void saveVendor(vendor);
    set({ vendor });
  },
  clearAuth: async () => {
    await clearToken();
    await clearVendor();
    set({ token: null, vendor: null });
  },
}));
