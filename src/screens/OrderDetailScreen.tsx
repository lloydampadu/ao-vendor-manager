import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { applyLocalStage, enqueueStage, getOrder, type Order } from "@/lib/db";
import { parseJson } from "@/lib/assignment-status";
import { payoutLabel } from "@/lib/mappers";
import { conditionDetail, conditionLabel, nextAction, orderSteps } from "@/lib/order-steps";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164 } from "@/constants/support";
import { useSyncStore } from "@/store/sync-store";
import { useSyncedQuery } from "@/hooks/useSyncedQuery";
import { ReusableText, HeightSpacer, NetworkImage, OrderDetailSkeleton, ReusableBtn } from "../../components";
import { vehicleLabel } from "../../components/RequestCard";
import { SHADOWS, SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrderDetail">;
type WonItem = { partName: string; condition: string; earnGhs: number; photos?: string[] };
type OrderRequest = { partName: string; make?: string | null; model?: string | null; year?: number | null };

const ghs = (n: number) => `GHS ${n.toLocaleString()}`;

/**
 * A paid order from the vendor's side, top to bottom: what it is, where it
 * stands (three steps), what to prepare, what they earn, and the one action
 * for this step pinned to the bottom.
 */
export default function OrderDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
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
    Alert.alert("Ready for pickup?", "We will send a rider to collect it from you.", [
      { text: "Not yet", style: "cancel" },
      { text: "Yes, it's ready", onPress: () => void queueStage("ON_THE_WAY", []) },
    ]);
  }, [queueStage]);

  const onHandedOver = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera needed", "Allow the camera to take a photo of the handover."); return; }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (shot.canceled || !shot.assets?.[0]) return;
    // The local file URI is queued; the upload happens at sync time so this works offline.
    await queueStage("HANDED_OVER", [shot.assets[0].uri]);
  }, [queueStage]);

  const callSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE_E164}`).catch(() => {
      Alert.alert("Couldn't open the dialer", `Call AbosseyOkai on ${SUPPORT_PHONE_DISPLAY}.`);
    });
  }, []);

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
  const steps = orderSteps(order.stage);
  const current = steps.find((s) => s.state === "current");
  const action = nextAction(order.stage);
  const payout = payoutLabel(order);
  const payoutColor = payout.tone === "paid" ? C.green : payout.tone === "owed" ? C.primary : C.gray2;
  const card = [styles.card, { backgroundColor: C.white }];

  return (
    <View style={{ flex: 1, backgroundColor: C.offwhite }}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: action ? 120 : 32 }]}>
        {/* What it is */}
        <View style={card}>
          <ReusableText text={req.partName} family="bold" size={SIZES.large} color={C.secondary} />
          {car ? <ReusableText text={car} family="regular" size={SIZES.medium} color={C.gray2} /> : null}
          <HeightSpacer height={10} />
          <View style={[styles.pill, { backgroundColor: C.primary1 }]}>
            <Ionicons name="checkmark-circle" size={14} color={C.green} />
            <ReusableText text="Customer has paid" family="medium" size={SIZES.small} color={C.secondary} />
          </View>
          <HeightSpacer height={10} />
          <ReusableText text="We will collect this and deliver it to the customer." family="regular" size={SIZES.small} color={C.gray2} />
        </View>

        {/* Where it stands */}
        <View style={card}>
          <ReusableText text="Progress" family="bold" size={SIZES.medium} color={C.secondary} />
          <HeightSpacer height={10} />
          {steps.map((s, i) => {
            const color = s.state === "todo" ? C.gray2 : C.primary;
            return (
              <View key={s.stage} style={styles.step} accessibilityLabel={`${s.title}: ${s.state === "done" ? "done" : s.state === "current" ? "now" : "next"}`}>
                <View style={styles.stepRail}>
                  <View style={[styles.dot, { borderColor: color, backgroundColor: s.state === "done" ? C.primary : C.white }]}>
                    {s.state === "done" ? <Ionicons name="checkmark" size={12} color={C.white} /> : null}
                  </View>
                  {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: s.state === "done" ? C.primary : C.gray }]} /> : null}
                </View>
                <View style={styles.stepText}>
                  <ReusableText text={s.title} family={s.state === "current" ? "bold" : "medium"} size={SIZES.medium} color={s.state === "todo" ? C.gray2 : C.secondary} />
                  {s.state === "current" || (s.state === "done" && s.stage === "HANDED_OVER") ? (
                    <ReusableText text={s.hint} family="regular" size={SIZES.small} color={C.gray2} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* What to prepare */}
        <View style={card}>
          <ReusableText text={items.length === 1 ? "Item to prepare" : `Items to prepare (${items.length})`} family="bold" size={SIZES.medium} color={C.secondary} />
          {items.map((it, i) => {
            const cond = conditionLabel(it.condition);
            const detail = conditionDetail(it.condition);
            return (
              <View key={i} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.gray }]}>
                <View style={styles.itemRow}>
                  <View style={styles.itemName}>
                    <ReusableText text={it.partName} family="medium" size={SIZES.medium} color={C.secondary} />
                    {cond ? (
                      <View style={[styles.chip, { backgroundColor: cond === "Used" ? C.secondary1 : C.primary1 }]}>
                        <ReusableText text={cond} family="medium" size={11} color={C.secondary} />
                      </View>
                    ) : null}
                  </View>
                  <ReusableText text={ghs(it.earnGhs)} family="bold" size={SIZES.medium} color={C.secondary} />
                </View>
                {detail ? <ReusableText text={detail} family="regular" size={SIZES.small} color={C.gray2} /> : null}
                {it.photos && it.photos.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
                    {it.photos.map((uri, p) => (
                      <View key={p} style={{ marginRight: 8 }}>
                        <NetworkImage source={uri} width={88} height={88} radius={8} />
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* What they earn */}
        <View style={card}>
          <View style={styles.itemRow}>
            <ReusableText text="You earn" family="medium" size={SIZES.medium} color={C.secondary} />
            <ReusableText text={ghs(order.total_earn_ghs)} family="bold" size={SIZES.large} color={C.primary} />
          </View>
          <HeightSpacer height={8} />
          <View style={styles.payoutRow}>
            <Ionicons name={payout.tone === "paid" ? "checkmark-circle" : "time-outline"} size={16} color={payoutColor} />
            <ReusableText text={payout.text} family="medium" size={SIZES.small} color={payoutColor} />
          </View>
          {order.payout_status === "PAID" && order.payout_amount_ghs != null && order.payout_amount_ghs !== order.total_earn_ghs ? (
            <ReusableText text={`Amount paid: ${ghs(order.payout_amount_ghs)}`} family="regular" size={SIZES.small} color={C.gray2} />
          ) : null}
          {order.payout_ref ? <ReusableText text={`Reference: ${order.payout_ref}`} family="regular" size={SIZES.small} color={C.gray2} /> : null}
          {payout.tone !== "paid" ? (
            <ReusableText text="We pay by MoMo or cash after we collect it." family="regular" size={SIZES.small} color={C.gray2} />
          ) : null}
        </View>

        {/* Help */}
        <TouchableOpacity onPress={callSupport} style={[styles.help, { borderColor: C.gray, backgroundColor: C.white }]} accessibilityRole="button" accessibilityLabel={`Call AbosseyOkai on ${SUPPORT_PHONE_DISPLAY}`}>
          <Ionicons name="call-outline" size={18} color={C.primary} />
          <View style={{ flex: 1 }}>
            <ReusableText text="Questions about this order?" family="medium" size={SIZES.small} color={C.secondary} />
            <ReusableText text={`Call us on ${SUPPORT_PHONE_DISPLAY}`} family="regular" size={SIZES.small} color={C.gray2} />
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.gray2} />
        </TouchableOpacity>
      </ScrollView>

      {/* The one action for this step, always in reach */}
      {action ? (
        <View style={[styles.footer, { backgroundColor: C.white, borderTopColor: C.gray, paddingBottom: insets.bottom + 12 }]}>
          {current ? <ReusableText text={current.hint} family="regular" size={SIZES.small} color={C.gray2} /> : null}
          <HeightSpacer height={8} />
          {action === "mark-ready" ? (
            <ReusableBtn onPress={onMarkReady} btnText={busy ? "Saving…" : "Mark ready for pickup"} backgroundColor={busy ? C.gray2 : C.primary} textColor={C.white} height={52} borderRadius={12} disabled={busy} />
          ) : (
            <ReusableBtn onPress={() => void onHandedOver()} btnText={busy ? "Saving…" : "Hand over to rider (take photo)"} backgroundColor={busy ? C.gray2 : C.primary} textColor={C.white} height={52} borderRadius={12} disabled={busy} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { borderRadius: 14, padding: 16, ...SHADOWS.small },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center", width: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
  stepText: { flex: 1, paddingBottom: 14, gap: 2 },
  item: { paddingVertical: 12, gap: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  itemName: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  photos: { marginTop: 6 },
  payoutRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  help: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
