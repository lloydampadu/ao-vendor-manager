import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getAssignments, type Assignment } from "@/lib/db";
import { effectiveStatus, INBOX_SEGMENTS, parseJson, type EffectiveStatus, type InboxSegmentKey } from "@/lib/assignment-status";
import { clearBadge } from "@/lib/notifications";
import { useSyncedQuery, usePullToRefresh } from "@/hooks/useSyncedQuery";
import { RequestCard, EmptyState, InboxSkeletonList, ReusableText } from "../../components";
import type { RequestData } from "../../components/RequestCard";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = NativeStackScreenProps<InboxStackParamList, "InboxList">;

type Row = { assignment: Assignment; status: EffectiveStatus; request: RequestData };

const EMPTY: Record<InboxSegmentKey, { title: string; subtitle: string }> = {
  new: { title: "No new requests", subtitle: "New part requests matching what you sell will show up here." },
  quoted: { title: "No quotes sent yet", subtitle: "Requests you've priced will show here, with the result once the customer decides." },
  closed: { title: "Nothing closed", subtitle: "Declined and expired requests end up here." },
};

function toRow(a: Assignment): Row {
  const quote = parseJson<{ status?: string } | null>(a.quote_data, null);
  return {
    assignment: a,
    status: effectiveStatus(a.status, quote),
    request: parseJson<RequestData>(a.request_data, { partName: "Part request" }),
  };
}

export default function InboxScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const [segment, setSegment] = useState<InboxSegmentKey>("new");

  const load = useCallback(async () => (await getAssignments()).map(toRow), []);
  const { data: rows, loading } = useSyncedQuery<Row[]>(load, []);
  const { refreshing, onRefresh } = usePullToRefresh();

  useEffect(() => { void clearBadge(); }, []);

  const bySegment = useMemo(() => {
    const out: Record<InboxSegmentKey, Row[]> = { new: [], quoted: [], closed: [] };
    for (const r of rows) {
      const seg = INBOX_SEGMENTS.find((s) => (s.statuses as readonly EffectiveStatus[]).includes(r.status));
      if (seg) out[seg.key].push(r);
    }
    return out;
  }, [rows]);

  const visible = bySegment[segment];
  const empty = EMPTY[segment];

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <View style={[styles.segments, { backgroundColor: C.white, borderBottomColor: C.gray }]}>
        {INBOX_SEGMENTS.map((s) => {
          const active = segment === s.key;
          const count = bySegment[s.key].length;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.seg, active && { borderBottomWidth: 2, borderBottomColor: C.primary }]}
              onPress={() => setSegment(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <SegmentLabel label={s.label} count={s.key === "new" ? count : undefined} active={active} />
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <InboxSkeletonList />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.assignment.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="mail-open-outline" title={empty.title} subtitle={empty.subtitle} />}
          renderItem={({ item }) => (
            <RequestCard
              status={item.status}
              requestData={item.request}
              updatedAt={item.assignment.updated_at}
              onPress={() => navigation.navigate("RequestDetail", { assignmentId: item.assignment.id })}
            />
          )}
        />
      )}
    </View>
  );
}

function SegmentLabel({ label, count, active }: { label: string; count?: number; active: boolean }) {
  const C = useThemeColors();
  return (
    <View style={styles.segLabel}>
      <ReusableText text={label} family={active ? "medium" : "regular"} size={SIZES.small} color={active ? C.primary : C.gray2} />
      {count != null && count > 0 && (
        <View style={[styles.countPill, { backgroundColor: active ? C.primary : C.gray }]}>
          <ReusableText text={String(count)} family="medium" size={11} color={active ? C.white : C.secondary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segments: { flexDirection: "row", borderBottomWidth: 1 },
  seg: { flex: 1, paddingVertical: 14, alignItems: "center" },
  segLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  countPill: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, gap: 10, flexGrow: 1 },
});
