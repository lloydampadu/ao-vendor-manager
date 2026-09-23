import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<Segment>("PENDING");
  const { isSyncing, startSync } = useSyncStore();
  const loadedSegments = useRef(new Set<Segment>());
  const isFocused = useIsFocused();

  const load = useCallback(async () => {
    if (!loadedSegments.current.has(segment)) {
      setLoading(true);
    }
    await initDb();
    const rows = await getAssignments(segment);
    setAssignments(rows);
    loadedSegments.current.add(segment);
    setLoading(false);
  }, [segment]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!isFocused) return;
    startSync().then(() => load()).catch(() => {});
  }, [isFocused]);

  useEffect(() => {
    void Notifications.setBadgeCountAsync(0);
  }, []);

  const onRefresh = useCallback(async () => {
    await startSync();
    await load();
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
            refreshing={isSyncing}
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
