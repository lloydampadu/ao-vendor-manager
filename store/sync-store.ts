import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { create } from "zustand";
import { sync as runSync } from "@/lib/sync";
import { isApiError } from "@/lib/api";
import { countPendingWrites } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("sync-store");

/** Background cadence while the app is in the foreground. */
const FOREGROUND_INTERVAL_MS = 30_000;

type SyncState = {
  isSyncing: boolean;
  isOnline: boolean;
  /** Monotonic counter bumped after every completed pass. Screens subscribe to
   *  this to reload from SQLite — it's the single "data may have changed" signal. */
  syncTick: number;
  lastSyncAt: Date | null;
  syncError: string | null;
  /** Queued local writes not yet accepted by the server. */
  pendingWrites: number;
  /** Runs one sync pass. If a pass is already running, a second one is
   *  scheduled right after it so a write made mid-pass isn't left waiting. */
  startSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
};

let rerunRequested = false;
let inFlight: Promise<void> | null = null;

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  isOnline: true,
  syncTick: 0,
  lastSyncAt: null,
  syncError: null,
  pendingWrites: 0,

  startSync: () => {
    if (inFlight) {
      rerunRequested = true;
      return inFlight;
    }
    inFlight = (async () => {
      do {
        rerunRequested = false;
        set({ isSyncing: true });
        try {
          const result = await runSync();
          const err = result.error;
          const offline = isApiError(err) && err.isNetworkError;
          set({
            lastSyncAt: result.ok ? new Date() : get().lastSyncAt,
            syncError: result.ok ? null : offline ? "offline" : "sync failed",
          });
          if (err && !offline) log.warn("sync pass had errors", err);
        } catch (err) {
          log.error("sync pass crashed", err);
          set({ syncError: "sync failed" });
        } finally {
          await get().refreshPendingCount().catch(() => {});
          set((s) => ({ isSyncing: false, syncTick: s.syncTick + 1 }));
        }
      } while (rerunRequested);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  },

  refreshPendingCount: async () => {
    const n = await countPendingWrites();
    if (n !== get().pendingWrites) set({ pendingWrites: n });
  },
}));

/** Resolves once no sync pass is running. Used by sign-out before wiping the DB. */
export function waitForSyncIdle(): Promise<void> {
  return inFlight ?? Promise.resolve();
}

/**
 * The one place that decides *when* to sync: on start, on an interval while
 * foregrounded, when the app returns to the foreground, and when connectivity
 * comes back. Screens never schedule their own polling.
 *
 * Returns a stop function. Call it on sign-out so a stale loop doesn't keep
 * hitting the API with no token.
 */
export function startSyncLoop(): () => void {
  const { startSync } = useSyncStore.getState();
  let interval: ReturnType<typeof setInterval> | null = null;

  const startInterval = () => {
    if (interval) return;
    interval = setInterval(() => void startSync(), FOREGROUND_INTERVAL_MS);
  };
  const stopInterval = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };

  void startSync();
  if (AppState.currentState === "active") startInterval();

  const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      startInterval();
      void startSync();
    } else {
      stopInterval();
    }
  });

  let wasOnline: boolean | null = null;
  const netSub = NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    useSyncStore.setState({ isOnline: online });
    if (wasOnline === false && online) void startSync();
    wasOnline = online;
  });

  return () => {
    stopInterval();
    appStateSub.remove();
    netSub();
  };
}
