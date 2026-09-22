import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getAssignments, getAllQuoteQueueStatusMap, type Assignment, type QuoteSyncStatus } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { StatusBadge, Card, ReusableText, HeightSpacer, WidthSpacer, SyncStatusIcon } from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { TabParamList } from "../navigation/TabNavigator";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, "MyQuotes">,
    NativeStackNavigationProp<InboxStackParamList>
  >;
};

type RequestData = { partName: string; make?: string; model?: string; year?: number };
type QuoteData  = { priceGhs: number; availability: string; notes?: string };

export default function QuotesScreen({ navigation }: Props): React.JSX.Element {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [syncStatusMap, setSyncStatusMap] = useState<Record<string, QuoteSyncStatus>>({});
  const [refreshing, setRefreshing] = useState(false);
  const { startSync } = useSyncStore();

  const load = useCallback(async () => {
    const [all, statusMap] = await Promise.all([getAssignments(), getAllQuoteQueueStatusMap()]);
    setRows(all.filter((a) => a.quote_data !== null));
    setSyncStatusMap(statusMap);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await startSync();
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [startSync, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offwhite }} edges={['top']}>
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={COLORS.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <ReusableText text="📋" family="regular" size={48} color={COLORS.gray2} />
          <HeightSpacer height={12} />
          <ReusableText text="No quotes yet" family="medium" size={SIZES.medium} color={COLORS.secondary} />
          <HeightSpacer height={6} />
          <ReusableText text="When you submit a quote it will appear here" family="regular" size={SIZES.small} color={COLORS.gray2} />
        </View>
      }
      renderItem={({ item }) => {
        const req = JSON.parse(item.request_data) as RequestData;
        const quote: QuoteData | null = item.quote_data
          ? (JSON.parse(item.quote_data) as QuoteData)
          : null;
        return (
          <Card
            onPress={() => navigation.navigate("Inbox", {
              screen: "RequestDetail",
              params: { assignmentId: item.id },
            })}
            style={styles.cardSpacing}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <ReusableText text={req.partName} family="medium" size={15} color={COLORS.secondary} numberOfLines={1} />
              </View>
              <WidthSpacer width={8} />
              <StatusBadge status={item.status} />
            </View>
            {quote !== null && (
              <>
                <HeightSpacer height={4} />
                <View style={styles.quoteRow}>
                  <ReusableText
                    text={`GHS ${quote.priceGhs} · ${quote.availability}`}
                    family="regular"
                    size={SIZES.small}
                    color={COLORS.gray2}
                  />
                  {syncStatusMap[item.id] != null && (
                    <SyncStatusIcon status={syncStatusMap[item.id]} />
                  )}
                </View>
              </>
            )}
          </Card>
        );
      }}
    />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, backgroundColor: COLORS.offwhite, flexGrow: 1 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  quoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardSpacing: { marginBottom: 10 },
});
