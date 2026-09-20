import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getAssignments, type Assignment } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { StatusBadge, Card, ReusableText, HeightSpacer, WidthSpacer } from "../../components";
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
  const { isSyncing, startSync } = useSyncStore();

  const load = useCallback(async () => {
    const all = await getAssignments();
    setRows(all.filter((a) => a.quote_data !== null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    await startSync();
    await load();
  }, [startSync, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offwhite }} edges={['top']}>
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
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
          <HeightSpacer height={40} />
          <ReusableText text="No submitted quotes yet" family="regular" size={SIZES.medium} color={COLORS.gray2} />
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
                <ReusableText
                  text={`GHS ${quote.priceGhs} · ${quote.availability}`}
                  family="regular"
                  size={SIZES.small}
                  color={COLORS.gray2}
                />
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
  emptyContainer: { alignItems: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardSpacing: { marginBottom: 10 },
});
