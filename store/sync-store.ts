import { create } from "zustand";
import { sync as doSync } from "@/lib/sync";

type SyncState = {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  syncError: string | null;
  startSync: () => Promise<void>;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  syncError: null,
  startSync: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true, syncError: null });
    try {
      await doSync();
      set({ lastSyncAt: new Date() });
    } catch (err) {
      const e = err as { message?: string };
      set({ syncError: e.message ?? "sync failed" });
    } finally {
      set({ isSyncing: false });
    }
  },
}));
