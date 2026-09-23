import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getAssignments, initDb, type Assignment } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { RequestCard, ReusableText, HeightSpacer, InboxSkeletonList } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<InboxStackParamList, "InboxList">;
};

const SEGMENTS = ["PENDING", "QUOTED", "DECLINED"] as const;
type Segment = (typeof SEGMENTS)[number];

type SegmentState = { loading: boolean; assignments: Assignment[] };

// Persists across remounts so we never show the skeleton on a return visit
const segmentLoaded: Partial<Record<Segment, boolean>> = {};

type RequestData = {
  partName: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  items?: { id: string; partName: string }[];
};

export default function InboxScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const [segment, setSegment] = useState<Segment>("PENDING");
  const [segmentStates, setSegmentStates] = useState<Record<Segment, SegmentState>>(() => ({
    PENDING:  { loading: !segmentLoaded["PENDING"],  assignments: [] },
    QUOTED:   { loading: !segmentLoaded["QUOTED"],   assignments: [] },
    DECLINED: { loading: !segmentLoaded["DECLINED"], assignments: [] },
  }));
  const [refreshing, setRefreshing] = useState(false);
  const { startSync } = useSyncStore();
  const isFocused = useIsFocused();
  const lastFpRef = useRef<Partial<Record<Segment, string>>>({});
  const firstFocusRef = useRef(true);
  // Always up-to-date segment for use inside stable callbacks
  const segmentRef = useRef<Segment>("PENDING");
  useEffect(() => { segmentRef.current = segment; }, [segment]);

  const { loading, assignments } = segmentStates[segment];

  // load() takes the target segment explicitly so it's stable (no segment dep)
  const load = useCallback(async (seg: Segment, silent = false) => {
    if (!silent && !segmentLoaded[seg]) {
      setSegmentStates((prev) => ({ ...prev, [seg]: { ...prev[seg], loading: true } }));
    }
    await initDb();
    const rows = await getAssignments(seg);
    const fp = rows.map((a) => `${a.id}:${a.status}:${a.updated_at}`).join("|");
    if (fp !== lastFpRef.current[seg]) {
      lastFpRef.current[seg] = fp;
      setSegmentStates((prev) => ({ ...prev, [seg]: { loading: false, assignments: rows } }));
    } else {
      setSegmentStates((prev) => ({ ...prev, [seg]: { ...prev[seg], loading: false } }));
    }
    segmentLoaded[seg] = true;
  }, []);

  // Pre-load all segments in parallel on mount so tab switches are instant
  useEffect(() => { void Promise.all(SEGMENTS.map((seg) => load(seg))); }, [load]);

  // Sync on focus — skip the very first mount (load() above handles it)
  useEffect(() => {
    if (!isFocused) return;
    if (firstFocusRef.current) {
      firstFocusRef.current = false;
      return;
    }
    startSync().then(() => load(segmentRef.current, true)).catch(() => {});
  }, [isFocused, startSync, load]);

  // Sync when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isFocused) {
        startSync().then(() => load(segmentRef.current, true)).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [isFocused, startSync, load]);

  // Poll every 30s while focused
  useEffect(() => {
    if (!isFocused) return;
    const id = setInterval(() => {
      startSync().then(() => load(segmentRef.current, true)).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [isFocused, startSync, load]);

  useEffect(() => {
    void Notifications.setBadgeCountAsync(0);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await startSync();
      await load(segmentRef.current);
    } finally {
      setRefreshing(false);
    }
  }, [startSync, load]);

  const handleCardPress = useCallback(
    (assignmentId: string) => navigation.navigate("RequestDetail", { assignmentId }),
    [navigation],
  );

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <View style={[styles.segments, { backgroundColor: C.white, borderBottomColor: C.gray }]}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.seg, segment === s && [styles.segActive, { borderBottomColor: C.primary }]]}
            onPress={() => setSegment(s)}
          >
            <ReusableText
              text={s}
              family={segment === s ? "medium" : "regular"}
              size={SIZES.small}
              color={segment === s ? C.primary : C.gray2}
            />
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ScrollView>
          <InboxSkeletonList />
        </ScrollView>
      ) : <FlatList
        data={assignments}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={C.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ReusableText text="📭" family="regular" size={48} color={C.gray2} />
            <HeightSpacer height={12} />
            <ReusableText
              text={segment === "PENDING" ? "No new requests" : segment === "QUOTED" ? "No quotes sent yet" : "No declined requests"}
              family="medium"
              size={SIZES.medium}
              color={C.secondary}
            />
            <HeightSpacer height={6} />
            <ReusableText
              text={segment === "PENDING" ? "Pull down to check for new requests" : "Your sent quotes will show here"}
              family="regular"
              size={SIZES.small}
              color={C.gray2}
            />
          </View>
        }
        renderItem={({ item }) => {
          const requestData = JSON.parse(item.request_data) as RequestData;
          return (
            <RequestCard
              id={item.id}
              status={item.status}
              requestData={requestData}
              updatedAt={item.updated_at}
              onPress={() => handleCardPress(item.id)}
            />
          );
        }}
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segments: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  seg: { flex: 1, paddingVertical: 16, alignItems: "center" },
  segActive: { borderBottomWidth: 2 },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
});
