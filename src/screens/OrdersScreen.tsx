import React, { useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getOrders, type Order } from "@/lib/db";
import { parseJson } from "@/lib/assignment-status";
import { useSyncedQuery, usePullToRefresh } from "@/hooks/useSyncedQuery";
import { ReusableText, HeightSpacer, InboxSkeletonList, NetworkImage, EmptyState } from "../../components";
import { vehicleLabel } from "../../components/RequestCard";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrdersList">;

// The stage enum is reused for the pickup model: AbosseyOkai collects from the
// vendor, so the vendor only prepares the part and hands it to our rider.
export const STAGE_LABEL: Record<string, string> = {
  TO_BRING: "To prepare",
  ON_THE_WAY: "Ready for pickup",
  HANDED_OVER: "Collected",
};

type OrderRequest = { partName: string; make?: string | null; model?: string | null; year?: number | null; customerName?: string | null };
type WonItem = { partName: string; condition: string; earnGhs: number; photos?: string[] };

export default function OrdersScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const load = useCallback(() => getOrders(), []);
  const { data: orders, loading } = useSyncedQuery<Order[]>(load, []);
  const { refreshing, onRefresh } = usePullToRefresh();

  if (loading) return <View style={{ flex: 1, backgroundColor: C.offwhite }}><InboxSkeletonList /></View>;

  return (
    <FlatList
      style={{ backgroundColor: C.offwhite }}
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
      ListEmptyComponent={<EmptyState icon="receipt-outline" title="No paid orders yet" subtitle="When a customer pays for a quote you won, it shows up here with pickup instructions." />}
      renderItem={({ item }) => {
        const req = parseJson<OrderRequest>(item.request_data, { partName: "Order" });
        const wonItems = parseJson<WonItem[]>(item.won_items, []);
        const thumb = wonItems.flatMap((w) => w.photos ?? [])[0];
        const car = vehicleLabel(req);
        const stageLabel = STAGE_LABEL[item.stage] ?? item.stage;
        const done = item.stage === "HANDED_OVER";
        return (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: C.white, borderColor: C.gray }]}
            onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}
            accessibilityRole="button"
          >
            <View style={styles.cardRow}>
              {thumb ? <NetworkImage source={thumb} width={56} height={56} radius={8} /> : null}
              <View style={styles.cardBody}>
                <ReusableText text={req.partName} family="medium" size={SIZES.medium} color={C.black} numberOfLines={2} />
                {car ? <ReusableText text={car} family="regular" size={SIZES.small} color={C.gray2} /> : null}
                <HeightSpacer height={8} />
                <View style={styles.row}>
                  <ReusableText text={`GHS ${item.total_earn_ghs.toLocaleString()}`} family="bold" size={SIZES.medium} color={C.primary} />
                  <View style={[styles.chip, { backgroundColor: done ? C.offwhite : C.primary1 }]}>
                    <ReusableText text={stageLabel} family="medium" size={SIZES.small} color={done ? C.gray2 : C.primary} />
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10, flexGrow: 1 },
  card: { padding: 14, borderRadius: 12, borderWidth: 1 },
  cardRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  cardBody: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
