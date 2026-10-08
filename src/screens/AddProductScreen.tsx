import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReusableText, HeightSpacer, RequestApprovalSheet } from "../../components";
import { useThemeColors } from "../../constants/theme";
import { useAuthStore } from "@/store/auth-store";
import { approvedKinds, autoOpenKind, type ProductKind } from "@/lib/approvals";
import { getCachedFluidCatalog } from "@/lib/db";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type Props = NativeStackScreenProps<ProductsStackParamList, "AddProduct">;

/**
 * "What are you adding?" Each approved kind opens its own form: Tyres → the
 * tyre form, Lamps → the lamp form, a part group → the part form. A vendor with
 * one kind goes straight to its form. Anything else is asked for first.
 */
export default function AddProductScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const [fluidKinds, setFluidKinds] = useState<string[]>([]);
  const [fluidKindsLoaded, setFluidKindsLoaded] = useState(false);
  useEffect(() => {
    void getCachedFluidCatalog()
      .then((c) => setFluidKinds(c?.kinds.map((k) => k.name) ?? []))
      .catch(() => {})
      .finally(() => setFluidKindsLoaded(true));
  }, []);
  const kinds = useMemo(() => approvedKinds(vendor?.specialties ?? [], fluidKinds), [vendor?.specialties, fluidKinds]);
  const pending = vendor?.pendingSpecialties ?? [];
  const [asking, setAsking] = useState(false);

  function open(kind: ProductKind): void {
    if (kind.form === "tyre") navigation.replace("AddEditTyreListing", {});
    else if (kind.form === "lamp") navigation.replace("AddEditLightListing", {});
    else if (kind.form === "fluid") navigation.replace("AddEditFluidListing", {});
    else navigation.replace("AddEditPartListing", { category: kind.partCategory! });
  }

  // One kind: skip this step and open its form directly, but only after the cached fluid kinds are read.
  const single = autoOpenKind(kinds, fluidKindsLoaded);
  useEffect(() => {
    if (single) open(single);
    // Replacing the screen ends it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single?.key]);
  if (!fluidKindsLoaded || single) return <View style={{ flex: 1, backgroundColor: C.offwhite }} />;

  return (
    <ScrollView style={{ backgroundColor: C.offwhite }} contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>
      <ReusableText text="What are you adding?" family="bold" size={24} color={C.secondary} />
      <HeightSpacer height={6} />
      <ReusableText text="Pick what you're selling." family="regular" size={13} color={C.gray2} />
      <HeightSpacer height={20} />
      <View style={styles.grid}>
        {kinds.map((kind) => (
          <TouchableOpacity
            key={kind.key}
            style={[styles.tile, { backgroundColor: C.white, borderColor: C.gray }]}
            onPress={() => open(kind)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Add ${kind.label}`}
          >
            <Ionicons name={kind.icon} size={32} color={C.primary} />
            <HeightSpacer height={8} />
            <ReusableText text={kind.label} family="medium" size={13} color={C.secondary} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.tile, styles.askTile, { borderColor: C.gray2 }]}
          onPress={() => setAsking(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Something else: ask for approval"
        >
          <Ionicons name="add-circle-outline" size={32} color={C.gray2} />
          <HeightSpacer height={8} />
          <ReusableText text="Something else" family="medium" size={13} color={C.secondary} />
          <ReusableText text="Ask for approval" family="regular" size={11} color={C.gray2} />
        </TouchableOpacity>
      </View>

      {pending.length > 0 && (
        <>
          <HeightSpacer height={24} />
          <ReusableText text="Waiting for approval" family="bold" size={15} color={C.secondary} />
          <HeightSpacer height={8} />
          <View style={styles.pendingWrap}>
            {pending.map((p) => (
              <View key={p} style={[styles.pending, { borderColor: C.gray, backgroundColor: C.white }]}>
                <Ionicons name="time-outline" size={12} color={C.gray2} />
                <ReusableText text={p} family="medium" size={12} color={C.gray2} numberOfLines={1} />
              </View>
            ))}
          </View>
        </>
      )}

      <RequestApprovalSheet visible={asking} onClose={() => setAsking(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingBottom: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47%", borderRadius: 14, padding: 20, alignItems: "center", borderWidth: 1.5 },
  askTile: { borderStyle: "dashed", backgroundColor: "transparent" },
  pendingWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pending: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, opacity: 0.8 },
});
