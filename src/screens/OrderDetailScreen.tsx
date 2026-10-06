import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getOrder, applyLocalStage, enqueueStage, type Order } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { ReusableText, HeightSpacer, NetworkImage, OrderDetailSkeleton } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrderDetail">;
type WonItem = { partName: string; condition: string; earnGhs: number; photos?: string[] };

// AbosseyOkai ops line — the vendor calls this to tell us the part is ready to collect.
const SUPPORT_PHONE = "+233506221697";
const SUPPORT_DISPLAY = "050 622 1697";

// Surface New/Used as a clear badge. Tyre options embed it as "... (NEW)";
// regular parts use "Brand New" / "Home Used". Anything else (e.g. "Separated")
// falls back to showing the raw label.
function conditionLabel(raw: string): string {
  const m = raw.match(/\b(new|used)\b/i);
  if (m) return m[1].toLowerCase() === "new" ? "New" : "Used";
  return raw.trim();
}

export default function OrderDetailScreen({ route }: Props): React.JSX.Element {
  const C = useThemeColors();
  const { orderId } = route.params;
  const { startSync } = useSyncStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setOrder(await getOrder(orderId)), [orderId]);
  useEffect(() => { void load(); }, [load]);

  const queueStage = useCallback(async (stage: string, photos: string[]) => {
    await enqueueStage({
      id: `${orderId}-${stage}-${Date.now()}`,
      order_id: orderId, stage, photos: JSON.stringify(photos),
      location: null, synced: 0, error: null, created_at: new Date().toISOString(),
    });
    await applyLocalStage(orderId, stage);
    await load();
    startSync().catch(() => {});
  }, [orderId, load, startSync]);

  // "Ready for pickup" reuses the ON_THE_WAY stage — no photo needed at this step.
  const onMarkReady = useCallback(() => { void queueStage("ON_THE_WAY", []); }, [queueStage]);

  const callSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {
      Alert.alert("Couldn't open dialer", `Call AbosseyOkai on ${SUPPORT_DISPLAY}.`);
    });
  }, []);

  const onHandedOver = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera needed", "Allow the camera to capture proof of handover."); return; }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const localUri = shot.assets[0].uri;
    // Enqueue with the local file URI — the upload happens at flush time so this
    // works offline.  setBusy is only used to prevent double-taps while we write
    // to SQLite, which is fast.
    setBusy(true);
    try {
      await queueStage("HANDED_OVER", [localUri]);
    } finally {
      setBusy(false);
    }
  }, [queueStage]);

  if (!order) return <ScrollView style={{ flex: 1, backgroundColor: C.offwhite }}><OrderDetailSkeleton /></ScrollView>;

  const req = JSON.parse(order.request_data) as { partName: string; make?: string; model?: string; year?: number; customerName?: string };
  const items = JSON.parse(order.won_items) as WonItem[];
  const car = [req.make, req.model, req.year].filter(Boolean).join(" ");

  return (
    <ScrollView style={{ backgroundColor: C.offwhite }} contentContainerStyle={styles.body}>
      <ReusableText text={req.partName} family="bold" size={SIZES.large} color={C.black} />
      {car ? <ReusableText text={car} family="regular" size={SIZES.medium} color={C.gray2} /> : null}
      <HeightSpacer height={10} />
      {/* An order only exists here once the customer has paid — make that explicit. */}
      <View style={[styles.paidBadge, { backgroundColor: C.green }]}>
        <ReusableText text="✓ Customer has paid" family="medium" size={SIZES.small} color={C.white} />
      </View>
      {req.customerName ? (
        <>
          <HeightSpacer height={10} />
          <ReusableText text={`Customer: ${req.customerName}`} family="medium" size={SIZES.small} color={C.secondary} />
        </>
      ) : null}
      <HeightSpacer height={10} />
      <ReusableText
        text="AbosseyOkai will collect this from you and deliver it to the customer."
        family="regular"
        size={SIZES.small}
        color={C.gray2}
      />
      <HeightSpacer height={8} />
      <TouchableOpacity onPress={callSupport} style={[styles.callRow, { borderColor: C.primary }]}>
        <ReusableText text={`📞 Call us when it's ready — ${SUPPORT_DISPLAY}`} family="medium" size={SIZES.small} color={C.primary} />
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
              <ReusableText text={`GHS ${it.earnGhs}`} family="medium" size={SIZES.small} color={C.primary} />
            </View>
            {/* Full line (brand, size, condition) so the vendor sees exactly what to bring. */}
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
        <ReusableText text={`GHS ${order.total_earn_ghs}`} family="bold" size={SIZES.medium} color={C.primary} />
      </View>

      <HeightSpacer height={24} />
      {order.stage === "HANDED_OVER" ? (
        <ReusableText text="✅ Handed to AbosseyOkai rider" family="medium" size={SIZES.medium} color={C.secondary} />
      ) : order.stage === "TO_BRING" ? (
        // Just landed — vendor gets the part ready for our rider to collect.
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={onMarkReady} disabled={busy}>
          <ReusableText text="Mark ready for pickup" family="bold" size={SIZES.medium} color={C.white} />
        </TouchableOpacity>
      ) : (
        // ON_THE_WAY = ready, waiting for our rider to come and collect it.
        <View style={{ gap: 10 }}>
          <ReusableText text="✅ Ready — waiting for our rider" family="medium" size={SIZES.medium} color={C.secondary} />
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={() => void onHandedOver()} disabled={busy}>
            <ReusableText text={busy ? "Saving…" : "Hand over to rider (take photo)"} family="bold" size={SIZES.medium} color={C.white} />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  paidBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  itemBlock: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  condChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  photoRow: { paddingVertical: 10 },
  callRow: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  btn: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
});
