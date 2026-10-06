import React, { useCallback, useMemo } from "react";
import { Alert, RefreshControl, SectionList, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { getTyreListings, type TyreListing } from "@/lib/db";
import { removeListing, saveTyreListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { useSyncStore } from "@/store/sync-store";
import { useSyncedQuery, usePullToRefresh } from "@/hooks/useSyncedQuery";
import { ReusableText, TyreListingsSkeleton, EmptyState } from "../../components";
import { ListingCard, GridSectionHeader, buildGridSections, gridStyles } from "../../components/ListingCard";
import { useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export const tyreSizeLabel = (l: { width: number; height: number; diameter: number }) => `${l.width}/${l.height} R${l.diameter}`;

export default function TyreListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const startSync = useSyncStore((s) => s.startSync);

  const load = useCallback(() => getTyreListings(), []);
  const { data: listings, loading, setData, refresh } = useSyncedQuery<TyreListing[]>(load, []);
  const { refreshing, onRefresh } = usePullToRefresh();
  const sections = useMemo(() => buildGridSections(listings, (l) => l.brand), [listings]);

  async function toggleStock(listing: TyreListing): Promise<void> {
    const next: TyreListing = { ...listing, in_stock: listing.in_stock ? 0 : 1, updated_at: new Date().toISOString() };
    setData((prev) => prev.map((l) => (l.id === listing.id ? next : l)));
    await saveTyreListing(next, false);
    void startSync();
  }

  function confirmDelete(listing: TyreListing): void {
    Alert.alert("Delete tyre listing", `Remove ${listing.brand} ${tyreSizeLabel(listing)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          void (async () => {
            setData((prev) => prev.filter((l) => l.id !== listing.id));
            await removeListing("tyre", listing.id, listing.server_id);
            await refresh();
            void startSync();
          })();
        },
      },
    ]);
  }

  if (loading) return <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}><TyreListingsSkeleton /></View>;

  return (
    <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity style={[gridStyles.addBtn, { backgroundColor: C.primary }]} onPress={() => nav.navigate("AddEditTyreListing", {})} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a tyre" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((l) => l.id).join("-")}
        contentContainerStyle={gridStyles.list}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
        ListEmptyComponent={<EmptyState icon="car-outline" title="No tyre listings yet" subtitle='Tap "Add a tyre" to list your first tyre. Customers see your stock when they search.' />}
        renderSectionHeader={({ section }) => <GridSectionHeader title={section.key} count={section.count} noun="tyre" />}
        renderItem={({ item: row }) => (
          <View style={gridStyles.row}>
            {[0, 1].map((i) => {
              const l = row[i];
              return (
                <View key={i} style={gridStyles.cell}>
                  {l ? (
                    <ListingCard
                      title={tyreSizeLabel(l)}
                      subtitle={l.model}
                      titleSize={19}
                      priceGhs={l.price_ghs}
                      condition={l.condition}
                      photo={parseJson<string[]>(l.photos, [])[0]}
                      inStock={l.in_stock === 1}
                      placeholderIcon="car-sport-outline"
                      onPress={() => nav.navigate("AddEditTyreListing", { listing: l })}
                      onDelete={() => confirmDelete(l)}
                      onToggleStock={() => void toggleStock(l)}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      />
    </View>
  );
}
