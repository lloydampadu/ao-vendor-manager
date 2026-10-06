import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useSyncStore } from "@/store/sync-store";
import { createLogger } from "@/lib/logger";

const log = createLogger("useSyncedQuery");

/**
 * Reads from the local database and re-reads whenever (a) the screen gains
 * focus or (b) a sync pass completes. This is how every list screen stays
 * current without owning a timer: the sync loop is the only scheduler.
 *
 * `load` must be referentially stable (wrap it in useCallback).
 */
export function useSyncedQuery<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const syncTick = useSyncStore((s) => s.syncTick);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await load();
      // Drop stale results if a newer refresh finished first.
      if (mounted.current && id === requestId.current) setData(next);
    } catch (err) {
      log.warn("load failed", err);
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (syncTick > 0) void refresh();
  }, [syncTick, refresh]);

  return { data, loading, refresh, setData };
}

/** Pull-to-refresh helper: runs a sync pass and reports the refreshing flag. */
export function usePullToRefresh() {
  const startSync = useSyncStore((s) => s.startSync);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await startSync();
    } finally {
      setRefreshing(false);
    }
  }, [startSync]);
  return { refreshing, onRefresh };
}
