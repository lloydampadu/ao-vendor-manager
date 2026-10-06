import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { applyLocalStage, enqueueStage, getOrder, type Order } from "@/lib/db";
import { parseJson } from "@/lib/assignment-status";
import { payoutLabel } from "@/lib/mappers";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164 } from "@/constants/support";
import { useSyncStore } from "@/store/sync-store";
import { useSyncedQuery } from "@/hooks/useSyncedQuery";
import { ReusableText, HeightSpacer, NetworkImage, OrderDetailSkeleton, ReusableBtn } from "../../components";
import { vehicleLabel } from "../../components/RequestCard";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrderDetail">;
type WonItem = { partName: string; condition: string; earnGhs: number; photos?: string[] };
type OrderRequest = { partName: string; make?: string | null; model?: string | null; year?: number | null; customerName?: string | null };

// Tyre options embed condition as "... (NEW)"; regular parts use "Brand New" /
// "Home Used". Anything else falls back to the raw label.
export function conditionLabel(raw: string): string {
  const m = raw.match(/\b(new|used)\b/i);
  if (m) return m[1].toLowerCase() === "new" ? "New" : "Used";
  return raw.trim();
}

export default function OrderDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const { orderId } = route.params;
  const startSync = useSyncStore((s) => s.startSync);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getOrder(orderId), [orderId]);
  const { data: order, loading, refresh } = useSyncedQuery<Order | null>(load, null);

  const queueStage = useCallback(async (stage: string, photos: string[]) => {
    setBusy(true);
    try {
      await enqueueStage({
        id: `${orderId}-${stage}-${Date.now()}`,
        order_id: orderId, stage, photos: JSON.stringify(photos),
        location: null, synced: 0, error: null, created_at: new Date().toISOString(),
      });
      await applyLocalStage(orderId, stage);
      await refresh();
      void startSync();
    } finally {
      setBusy(false);
    }
  }, [orderId, refresh, startSync]);

  const onMarkReady = useCallback(() => {
    Alert.alert("Ready for pickup?", "We'll send a rider to collect it from you.", [
      { text: "Not yet", style: "cancel" },
      { text: "Yes, it's ready", onPress: () => void queueStage("ON_THE_WAY", []) },
    ]);
  }, [queueStage]);

  const callSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE_E164}`).catch(() => {
      Alert.alert("Couldn't open the dialer", `Call AbosseyOkai on ${SUPPORT_PHONE_DISPLAY}.`);
    });
  }, []);

  const onHandedOver = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera needed", "Allow the camera to capture proof of handover."); return; }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (shot.canceled || !shot.assets?.[0]) return;
    // The local file URI is queued; the upload happens at sync time so this works offline.
    await queueStage("HANDED_OVER", [shot.assets[0].uri]);
  }, [queueStage]);

  if (loading && !order) return <ScrollView style={{ flex: 1, backgroundColor: C.offwhite }}><OrderDetailSkeleton /></ScrollView>;
  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: C.offwhite }]}>
        <ReusableText text="This order is no longer available." family="medium" size={SIZES.medium} color={C.gray2} />
        <HeightSpacer height={12} />
        <ReusableBtn onPress={() => navigation.goBack()} btnText="Back to orders" backgroundColor={C.primary} textColor={C.white} width={180} height={44} />
      </View>
    );
  }

  const req = parseJson<OrderRequest>(order.request_data, { partName: "Order" });
  const items = parseJson<WonItem[]>(order.won_items, []);
  const car = vehicleLabel(req);

  return (
    <ScrollView style={{ backgroundColor: C.offwhite }} contentContainerStyle={styles.body}>
      <ReusableText text={req.partName} family="bold" size={SIZES.large} color={C.black} />
      {car ? <ReusableText text={car} family="regular" size={SIZES.medium} color={C.gray2} /> : null}
      <HeightSpacer height={10} />
      <View style={[styles.paidBadge, { backgroundColor: C.green }]}>
        <ReusableText text="✓ Customer has paid" family="medium" size={SIZES.small} color={C.white} />
      </View>
      {req.customerName ? (<><HeightSpacer height={10} /><ReusableText text={`Customer: ${req.customerName}`} family="medium" size={SIZES.small} color={C.secondary} /></>) : null}
      <HeightSpacer height={10} />
      <ReusableText text="AbosseyOkai will collect this from you and deliver it to the customer." family="regular" size={SIZES.small} color={C.gray2} />
      <HeightSpacer height={8} />
      <TouchableOpacity onPress={callSupport} style={[styles.callRow, { borderColor: C.primary }]} accessibilityRole="link">
        <ReusableText text={`📞 Call us when it's ready — ${SUPPORT_PHONE_DISPLAY}`} family="medium" size={SIZES.small} color={C.primary} />
      </TouchableOpacity>
      <HeightSpacer height={16} />

      <ReusableText text="Get these ready" family="medium" size={SIZES.medium} color={C.secondary} />
      {items.map((it, i) => {
        const cond = conditionLabel(it.condition);
        return (
          <View key={i} style={[styles.itemBlock, { borderColor: C.gray }]}>
            <View style={styles.itemRow}>
              <View style={styles.itemNameWrap}>
                <ReusableText text={it.partName} family="medium" size={SIZES.small} color={C.black} />
                {cond ? (
                  <View style={[styles.condChip, { backgroundColor: cond === "Used" ? C.secondary : C.primary }]}>
                    <ReusableText text={cond} family="medium" size={SIZES.small} color={C.white} />
                  </View>
                ) : null}
              </View>
              <ReusableText text={`GHS ${it.earnGhs.toLocaleString()}`} family="medium" size={SIZES.small} color={C.primary} />
            </View>
            <ReusableText text={it.condition} family="regular" size={SIZES.small} color={C.gray2} />
            {it.photos && it.photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                {it.photos.map((uri, p) => (
                  <View key={p} style={{ marginRight: 8 }}>
                    <NetworkImage source={uri} width={96} height={96} radius={8} />
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        );
      })}
      <HeightSpacer height={12} />
      <View style={styles.itemRow}>
        <ReusableText text="You earn" family="medium" size={SIZES.medium} color={C.black} />
        <ReusableText text={`GHS ${order.total_earn_ghs.toLocaleString()}`} family="bold" size={SIZES.medium} color={C.primary} />
      </View>
      <HeightSpacer height={6} />
      {(() => {
        const payout = payoutLabel(order);
        const color = payout.tone === "paid" ? C.green : payout.tone === "owed" ? C.primary : C.gray2;
        return (
          <View style={[styles.payoutBox, { borderColor: color, backgroundColor: payout.tone === "paid" ? "#f0fdf4" : C.white }]}>
            <ReusableText text={payout.text} family="medium" size={SIZES.small} color={color} />
            {order.payout_status === "PAID" && order.payout_amount_ghs != null && order.payout_amount_ghs !== order.total_earn_ghs ? (
              <ReusableText text={`Amount paid: GHS ${order.payout_amount_ghs.toLocaleString()}`} family="regular" size={11} color={C.gray2} />
            ) : null}
            {order.payout_ref ? <ReusableText text={`Ref: ${order.payout_ref}`} family="regular" size={11} color={C.gray2} /> : null}
            {payout.tone === "owed" ? (
              <ReusableText text={`We pay by MoMo or cash after collection. Questions? Call ${SUPPORT_PHONE_DISPLAY}.`} family="regular" size={11} color={C.gray2} />
            ) : null}
          </View>
        );
      })()}

      <HeightSpacer height={24} />
      {order.stage === "HANDED_OVER" ? (
        <ReusableText text="✅ Handed to the AbosseyOkai rider" family="medium" size={SIZES.medium} color={C.secondary} />
      ) : order.stage === "TO_BRING" ? (
        <ReusableBtn onPress={onMarkReady} btnText={busy ? "Saving…" : "Mark ready for pickup"} backgroundColor={C.primary} textColor={C.white} height={52} disabled={busy} />
      ) : (
        <View style={{ gap: 10 }}>
          <ReusableText text="✅ Ready — waiting for our rider" family="medium" size={SIZES.medium} color={C.secondary} />
          <ReusableBtn onPress={() => void onHandedOver()} btnText={busy ? "Saving…" : "Hand over to rider (take photo)"} backgroundColor={C.primary} textColor={C.white} height={52} disabled={busy} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  paidBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  itemBlock: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  condChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  photoRow: { paddingVertical: 10 },
  callRow: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  payoutBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
});
