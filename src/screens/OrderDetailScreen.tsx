import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getOrder, applyLocalStage, enqueueStage, type Order } from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import { uploadImage } from "../../lib/upload";
import { ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { OrdersStackParamList } from "../navigation/OrdersStackNavigator";

type Props = NativeStackScreenProps<OrdersStackParamList, "OrderDetail">;
type WonItem = { partName: string; condition: string; earnGhs: number };

const NEXT: Record<string, string | null> = { TO_BRING: "ON_THE_WAY", ON_THE_WAY: "HANDED_OVER", HANDED_OVER: null };

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

  const onOnTheWay = useCallback(() => { void queueStage("ON_THE_WAY", []); }, [queueStage]);

  const onHandedOver = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera needed", "Allow the camera to capture proof of handover."); return; }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (shot.canceled || !shot.assets?.[0]) return;
    setBusy(true);
    try {
      const asset = shot.assets[0];
      const url = await uploadImage(asset.uri);
      await queueStage("HANDED_OVER", [url]);
    } catch {
      Alert.alert("Upload failed", "Could not upload the photo. Try again when you have signal.");
    } finally {
      setBusy(false);
    }
  }, [queueStage]);

  if (!order) return <View style={{ flex: 1, backgroundColor: C.offwhite }} />;

  const req = JSON.parse(order.request_data) as { partName: string; make?: string; model?: string; year?: number };
  const items = JSON.parse(order.won_items) as WonItem[];
  const car = [req.make, req.model, req.year].filter(Boolean).join(" ");
  const next = NEXT[order.stage];

  return (
    <ScrollView style={{ backgroundColor: C.offwhite }} contentContainerStyle={styles.body}>
      <ReusableText text={req.partName} family="bold" size={SIZES.large} color={C.black} />
      {car ? <ReusableText text={car} family="regular" size={SIZES.medium} color={C.gray2} /> : null}
      <HeightSpacer height={16} />

      <ReusableText text="Bring these" family="medium" size={SIZES.medium} color={C.secondary} />
      {items.map((it, i) => (
        <View key={i} style={[styles.itemRow, { borderColor: C.gray }]}>
          <ReusableText text={`${it.partName} · ${it.condition}`} family="regular" size={SIZES.small} color={C.black} />
          <ReusableText text={`GHS ${it.earnGhs}`} family="medium" size={SIZES.small} color={C.primary} />
        </View>
      ))}
      <HeightSpacer height={8} />
      <View style={styles.itemRow}>
        <ReusableText text="You earn" family="medium" size={SIZES.medium} color={C.black} />
        <ReusableText text={`GHS ${order.total_earn_ghs}`} family="bold" size={SIZES.medium} color={C.primary} />
      </View>

      <HeightSpacer height={24} />
      {order.stage === "HANDED_OVER" ? (
        <ReusableText text="✅ Handed over to AbosseyOkai" family="medium" size={SIZES.medium} color={C.secondary} />
      ) : (
        <View style={{ gap: 10 }}>
          {order.stage === "TO_BRING" ? (
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.offwhite, borderColor: C.primary }]} onPress={onOnTheWay} disabled={busy}>
              <ReusableText text="I'm on the way" family="medium" size={SIZES.medium} color={C.primary} />
            </TouchableOpacity>
          ) : null}
          {next ? (
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={() => void onHandedOver()} disabled={busy}>
              <ReusableText text={busy ? "Uploading…" : "Mark handed over (photo)"} family="bold" size={SIZES.medium} color={C.white} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  btn: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
});
