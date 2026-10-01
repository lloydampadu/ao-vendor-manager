import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getOrders, initDb, type Order } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { ReusableText, HeightSpacer, InboxSkeletonList, NetworkImage } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = { navigation: NativeStackNavigationProp<OrdersStackParamList, "OrdersList"> };

const STAGE_LABEL: Record<string, string> = {
  TO_BRING: "To bring", ON_THE_WAY: "On the way", HANDED_OVER: "Handed over",
};

export default function OrdersScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { startSync } = useSyncStore();
  const isFocused = useIsFocused();
  const firstFocus = useRef(true);

  const load = useCallback(async () => {
    await initDb();
    setOrders(await getOrders());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!isFocused) return;
    if (firstFocus.current) { firstFocus.current = false; return; }
    startSync().then(load).catch(() => {});
  }, [isFocused, startSync, load]);

  useEffect(() => {
    if (!isFocused) return;
    const id = setInterval(() => startSync().then(load).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [isFocused, startSync, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await startSync(); await load(); } finally { setRefreshing(false); }
  }, [startSync, load]);

  if (loading) return <ScrollView style={{ backgroundColor: C.offwhite }}><InboxSkeletonList /></ScrollView>;

  return (
    <FlatList
      style={{ backgroundColor: C.offwhite }}
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <ReusableText text="🧾" family="regular" size={48} color={C.gray2} />
          <HeightSpacer height={12} />
          <ReusableText text="No won orders yet" family="medium" size={SIZES.medium} color={C.secondary} />
          <HeightSpacer height={6} />
          <ReusableText text="When a customer pays for your quote, it shows up here" family="regular" size={SIZES.small} color={C.gray2} />
        </View>
      }
      renderItem={({ item }) => {
        const req = JSON.parse(item.request_data) as { partName: string; make?: string; model?: string; year?: number };
        const car = [req.make, req.model, req.year].filter(Boolean).join(" ");
        const wonItems = JSON.parse(item.won_items) as { photos?: string[] }[];
        const thumb = wonItems.flatMap((w) => w.photos ?? [])[0];
        return (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: C.white, borderColor: C.gray }]}
            onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}
          >
            <View style={styles.cardRow}>
              {thumb ? <NetworkImage source={thumb} width={56} height={56} radius={8} /> : null}
              <View style={styles.cardBody}>
                <ReusableText text={req.partName} family="medium" size={SIZES.medium} color={C.black} />
                {car ? <ReusableText text={car} family="regular" size={SIZES.small} color={C.gray2} /> : null}
                <HeightSpacer height={8} />
                <View style={styles.row}>
                  <ReusableText text={`GHS ${item.total_earn_ghs}`} family="bold" size={SIZES.medium} color={C.primary} />
                  <View style={styles.chipGroup}>
                    {/* Orders only reach this tab once the customer has paid, so the
                        Paid badge is always shown — the vendor shouldn't have to infer it. */}
                    <View style={[styles.chip, { backgroundColor: C.green }]}>
                      <ReusableText text="✓ Paid" family="medium" size={SIZES.small} color={C.white} />
                    </View>
                    <View style={[styles.chip, { backgroundColor: C.offwhite }]}>
                      <ReusableText text={STAGE_LABEL[item.stage] ?? item.stage} family="medium" size={SIZES.small} color={C.secondary} />
                    </View>
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
  chipGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
});
