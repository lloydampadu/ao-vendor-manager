import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import * as Notifications from "expo-notifications";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getAssignments, initDb, type Assignment } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { RequestCard, ReusableText, HeightSpacer } from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<InboxStackParamList, "InboxList">;
};

const SEGMENTS = ["PENDING", "QUOTED", "DECLINED"] as const;
type Segment = (typeof SEGMENTS)[number];

type RequestData = {
  partName: string;
  makeModel?: string | null;
  year?: number | null;
  tyreSize?: string | null;
  notes?: string | null;
  type?: string | null;
};

export default function InboxScreen({ navigation }: Props): React.JSX.Element {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [segment, setSegment] = useState<Segment>("PENDING");
  const { isSyncing, startSync } = useSyncStore();

  const load = useCallback(async () => {
    await initDb();
    const rows = await getAssignments(segment);
    setAssignments(rows);
  }, [segment]);

  useEffect(() => { void load(); }, [load]);

  // Clear badge when inbox is opened
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
    <View style={styles.container}>
      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.seg, segment === s && styles.segActive]}
            onPress={() => setSegment(s)}
          >
            <ReusableText
              text={s}
              family={segment === s ? "medium" : "regular"}
              size={SIZES.small}
              color={segment === s ? COLORS.primary : COLORS.gray2}
            />
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={assignments}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={() => void onRefresh()}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ReusableText text="📭" family="regular" size={48} color={COLORS.gray2} />
            <HeightSpacer height={12} />
            <ReusableText
              text={segment === "PENDING" ? "No new requests" : segment === "QUOTED" ? "No quotes submitted yet" : "No declined requests"}
              family="medium"
              size={SIZES.medium}
              color={COLORS.secondary}
            />
            <HeightSpacer height={6} />
            <ReusableText
              text={segment === "PENDING" ? "Pull down to refresh for new jobs" : "Quoted jobs will appear here"}
              family="regular"
              size={SIZES.small}
              color={COLORS.gray2}
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.offwhite },
  segments: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray,
  },
  seg: { flex: 1, paddingVertical: 16, alignItems: "center" },
  segActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  list: { padding: 12, flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
});
