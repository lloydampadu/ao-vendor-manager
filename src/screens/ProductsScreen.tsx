import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { errorMessage, productsApi, type ApiProduct } from "@/lib/api";
import { cacheProducts, getCachedProducts, getBatteryListings, getFluidListings, getLightListings, getTyreListings, type BatteryListing, type FluidListing, type LightListing, type TyreListing } from "@/lib/db";
import { discardRejectedBattery, setBatteryStock, discardRejectedFluid, removeListing, setFluidStock, saveLightListing, saveTyreListing } from "@/lib/listings";
import { batteryListingTitle } from "@/lib/battery-form";
import { listingNote } from "@/lib/listing-note";
import { fluidListingTitle, fluidNote } from "@/lib/fluid-catalog";
import { parseJson } from "@/lib/assignment-status";
import { productSections, type ProductItem } from "@/lib/products";
import { useSyncStore } from "@/store/sync-store";
import { useAuthStore } from "@/store/auth-store";
import { useSyncedQuery, usePullToRefresh } from "@/hooks/useSyncedQuery";
import { ReusableText, ProductsSkeletonList, EmptyState, RequestApprovalSheet } from "../../components";
import { ListingCard, GridSectionHeader, gridStyles } from "../../components/ListingCard";
import { useThemeColors } from "../../constants/theme";
import { tyreSizeLabel } from "@/lib/tyre-sizes";
import { parsePriceAdvice, priceNote } from "@/lib/tyre-catalog";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

/**
 * Everything the vendor sells on one list: tyres, lamps and parts. Tyres and
 * lamps live in SQLite with an offline write queue; parts are online-only with
 * a SQLite cache for first paint. Each item opens its own edit form.
 */
export default function ProductsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const startSync = useSyncStore((s) => s.startSync);
  const isOnline = useSyncStore((s) => s.isOnline);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const pendingCount = useAuthStore((s) => s.vendor?.pendingSpecialties.length ?? 0);
  const [asking, setAsking] = useState(false);

  const loadTyres = useCallback(() => getTyreListings(), []);
  const loadLamps = useCallback(() => getLightListings(), []);
  const tyres = useSyncedQuery<TyreListing[]>(loadTyres, []);
  const lamps = useSyncedQuery<LightListing[]>(loadLamps, []);
  const loadFluids = useCallback(() => getFluidListings(), []);
  const fluids = useSyncedQuery<FluidListing[]>(loadFluids, []);
  const loadBatteries = useCallback(() => getBatteryListings(), []);
  const batteries = useSyncedQuery<BatteryListing[]>(loadBatteries, []);
  const { refreshing: syncing, onRefresh: syncNow } = usePullToRefresh();

  const [parts, setParts] = useState<ApiProduct[]>([]);
  const [partsLoading, setPartsLoading] = useState(true);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadParts = useCallback(async (showCache: boolean) => {
    if (showCache) {
      const cached = await getCachedProducts<ApiProduct>();
      if (cached.length > 0) { setParts(cached); setPartsLoading(false); }
    }
    try {
      const { products } = await productsApi.getAll();
      setParts(products);
      setPartsError(null);
      await cacheProducts(products);
    } catch (e) {
      setPartsError(errorMessage(e, "Couldn't load your parts."));
    } finally {
      setPartsLoading(false);
    }
  }, []);

  // Approvals arrive on the profile: refresh it whenever the vendor comes back here.
  useFocusEffect(useCallback(() => { void loadParts(true); void refreshProfile(); }, [loadParts, refreshProfile]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([loadParts(false), syncNow(), refreshProfile()]); } finally { setRefreshing(false); }
  }, [loadParts, syncNow, refreshProfile]);

  const sections = useMemo(() => productSections(tyres.data, lamps.data, parts, fluids.data, batteries.data), [tyres.data, lamps.data, parts, fluids.data, batteries.data]);

  async function toggleStock(item: ProductItem): Promise<void> {
    if (item.kind === "tyre") {
      const next: TyreListing = { ...item.row, in_stock: item.row.in_stock ? 0 : 1, updated_at: new Date().toISOString() };
      tyres.setData((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      await saveTyreListing(next, false);
      void startSync();
    } else if (item.kind === "lamp") {
      const next: LightListing = { ...item.row, in_stock: item.row.in_stock ? 0 : 1, updated_at: new Date().toISOString() };
      lamps.setData((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      await saveLightListing(next, false);
      void startSync();
    } else if (item.kind === "fluid") {
      if (item.row.status === "REJECTED") return;
      const next = await setFluidStock(item.row, !item.row.in_stock);
      fluids.setData((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      void startSync();
    } else if (item.kind === "battery") {
      if (item.row.status === "REJECTED") return;
      const next = await setBatteryStock(item.row, !item.row.in_stock);
      batteries.setData((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      void startSync();
    } else {
      const p = item.row;
      const flip = (inStock: boolean) => setParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, inStock } : x)));
      flip(!p.inStock);
      try {
        await productsApi.update(p.id, { inStock: !p.inStock });
      } catch (e) {
        flip(p.inStock);
        Alert.alert("Couldn't update stock", errorMessage(e, "Changing stock needs an internet connection."));
      }
    }
  }

  async function remove(item: ProductItem): Promise<void> {
    if (item.kind === "tyre") {
      tyres.setData((prev) => prev.filter((l) => l.id !== item.row.id));
      await removeListing("tyre", item.row.id, item.row.server_id);
      await tyres.refresh();
      void startSync();
    } else if (item.kind === "lamp") {
      lamps.setData((prev) => prev.filter((l) => l.id !== item.row.id));
      await removeListing("light", item.row.id, item.row.server_id);
      await lamps.refresh();
      void startSync();
    } else if (item.kind === "fluid") {
      fluids.setData((prev) => prev.filter((l) => l.id !== item.row.id));
      // A refused row never reached the server: deleting it is local only.
      if (item.row.status === "REJECTED") await discardRejectedFluid(item.row.id);
      else await removeListing("fluid", item.row.id, item.row.server_id);
      await fluids.refresh();
      void startSync();
    } else if (item.kind === "battery") {
      batteries.setData((prev) => prev.filter((l) => l.id !== item.row.id));
      // A refused row never reached the server: deleting it is local only.
      if (item.row.status === "REJECTED") await discardRejectedBattery(item.row.id);
      else await removeListing("battery", item.row.id, item.row.server_id);
      await batteries.refresh();
      void startSync();
    } else {
      try {
        await productsApi.delete(item.row.id);
        setParts((prev) => prev.filter((p) => p.id !== item.row.id));
      } catch (e) {
        Alert.alert("Couldn't delete", errorMessage(e, "Deleting needs an internet connection."));
      }
    }
  }

  function confirmDelete(item: ProductItem): void {
    Alert.alert("Delete", `Remove ${titleOf(item)}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove(item) },
    ]);
  }

  function edit(item: ProductItem): void {
    if (item.kind === "tyre") nav.navigate("AddEditTyreListing", { listing: item.row });
    else if (item.kind === "lamp") nav.navigate("AddEditLightListing", { listing: item.row });
    else if (item.kind === "fluid") nav.navigate("AddEditFluidListing", { listing: item.row });
    else if (item.kind === "battery") nav.navigate("AddEditBatteryListing", { listing: item.row });
    else nav.navigate("AddEditPartListing", { category: item.row.category ?? "Other", product: item.row });
  }

  if (tyres.loading || lamps.loading || fluids.loading || batteries.loading || partsLoading) {
    return <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}><ProductsSkeletonList /></View>;
  }

  return (
    <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity style={[gridStyles.addBtn, { backgroundColor: C.primary }]} onPress={() => nav.navigate("AddProduct")} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a product" family="bold" size={15} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.askRow} onPress={() => setAsking(true)} accessibilityRole="button">
        <ReusableText text="Sell something new? Ask for approval" family="medium" size={13} color={C.primary} />
        {pendingCount > 0 ? <ReusableText text={` · ${pendingCount} waiting`} family="regular" size={13} color={C.gray2} /> : null}
      </TouchableOpacity>

      {partsError && parts.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <ReusableText text={isOnline ? `Parts: showing saved copy — ${partsError}` : "Parts: showing saved copy — you're offline."} family="regular" size={11} color={C.gray2} />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((i) => i.id).join("-")}
        contentContainerStyle={gridStyles.list}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing || syncing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
        ListEmptyComponent={
          partsError
            ? <EmptyState icon="cloud-offline-outline" title="Couldn't load your products" subtitle={`${partsError} Pull down to try again.`} />
            : <EmptyState icon="cube-outline" title="No products yet" subtitle='Tap "Add a product" to list your first one.' />
        }
        renderSectionHeader={({ section }) => <GridSectionHeader title={section.key} count={section.count} noun={section.noun} />}
        renderItem={({ item: row }) => (
          <View style={gridStyles.row}>
            {[0, 1].map((i) => {
              const item = row[i];
              return (
                <View key={i} style={gridStyles.cell}>
                  {item ? (
                    <ListingCard
                      {...cardOf(item)}
                      onPress={() => edit(item)}
                      onDelete={() => confirmDelete(item)}
                      onToggleStock={() => void toggleStock(item)}
                      deleteOnly={(item.kind === "fluid" || item.kind === "battery") && item.row.status === "REJECTED"}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      />

      <RequestApprovalSheet visible={asking} onClose={() => setAsking(false)} />
    </View>
  );
}

function titleOf(item: ProductItem): string {
  if (item.kind === "tyre") return `${item.row.brand} ${tyreSizeLabel(item.row)}`.trim();
  if (item.kind === "lamp") return `${item.row.light_type}${item.row.side !== "N/A" ? ` (${item.row.side})` : ""}`;
  if (item.kind === "fluid") return fluidListingTitle(item.row);
  if (item.kind === "battery") return batteryListingTitle(item.row);
  return `"${item.row.name}"`;
}

function cardOf(item: ProductItem) {
  if (item.kind === "tyre") {
    const l = item.row;
    return { title: tyreSizeLabel(l), subtitle: [l.brand, l.model].filter(Boolean).join(" · "), titleSize: 19, priceGhs: l.price_ghs, condition: l.condition,
      photo: parseJson<string[]>(l.photos, [])[0], inStock: l.in_stock === 1, placeholderIcon: "car-sport-outline" as const,
      note: priceNote(parsePriceAdvice(l.price_advice)) ?? (l.proposed === 1 && !l.tyre_size_id ? "Waiting for approval: customers can't see it yet." : null) };
  }
  if (item.kind === "lamp") {
    const l = item.row;
    return { title: l.light_type, subtitle: [l.side !== "N/A" ? l.side : null, l.make, l.model, l.year].filter(Boolean).join(" · "), priceGhs: l.price_ghs, condition: l.condition,
      photo: parseJson<string[]>(l.photos, [])[0], inStock: l.in_stock === 1, placeholderIcon: "bulb-outline" as const };
  }
  if (item.kind === "fluid") {
    const l = item.row;
    return { title: `${l.brand} ${l.product}`, subtitle: [l.grade, l.size_label].filter(Boolean).join(" · "), priceGhs: l.price_ghs, condition: "NEW",
      photo: parseJson<string[]>(l.photos, [])[0], inStock: l.in_stock === 1, placeholderIcon: "water-outline" as const,
      note: fluidNote(l) ?? priceNote(parsePriceAdvice(l.price_advice)) };
  }
  if (item.kind === "battery") {
    const l = item.row;
    return { title: `${l.brand} ${l.size_code}`, subtitle: [l.terminal === "LEFT" ? "Positive left" : "Positive right", `${l.capacity_ah}Ah`, `${l.warranty_months} mo warranty`].join(" · "), priceGhs: l.price_ghs, condition: "NEW",
      photo: parseJson<string[]>(l.photos, [])[0], inStock: l.in_stock === 1, placeholderIcon: "battery-charging-outline" as const,
      note: listingNote(l) ?? priceNote(parsePriceAdvice(l.price_advice)) };
  }
  const p = item.row;
  return { title: p.name, titleSize: 12, priceGhs: p.priceGhs, condition: p.condition, photo: p.photos[0], inStock: p.inStock, placeholderIcon: "cube-outline" as const };
}

const styles = StyleSheet.create({
  askRow: { flexDirection: "row", justifyContent: "center", marginTop: -4, marginBottom: 8 },
});
