import React, { useCallback, useMemo } from "react";
import { Alert, RefreshControl, SectionList, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { getLightListings, type LightListing } from "@/lib/db";
import { removeListing, saveLightListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { useSyncStore } from "@/store/sync-store";
import { useSyncedQuery, usePullToRefresh } from "@/hooks/useSyncedQuery";
import { ReusableText, LightListingsSkeleton, EmptyState } from "../../components";
import { ListingCard, GridSectionHeader, buildGridSections, gridStyles } from "../../components/ListingCard";
import { useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export default function LightListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const startSync = useSyncStore((s) => s.startSync);

  const load = useCallback(() => getLightListings(), []);
  const { data: listings, loading, setData, refresh } = useSyncedQuery<LightListing[]>(load, []);
  const { refreshing, onRefresh } = usePullToRefresh();
  const sections = useMemo(() => buildGridSections(listings, (l) => l.make), [listings]);

  async function toggleStock(listing: LightListing): Promise<void> {
    const next: LightListing = { ...listing, in_stock: listing.in_stock ? 0 : 1, updated_at: new Date().toISOString() };
    setData((prev) => prev.map((l) => (l.id === listing.id ? next : l)));
    await saveLightListing(next, false);
    void startSync();
  }

  function confirmDelete(listing: LightListing): void {
    const label = `${listing.light_type}${listing.side !== "N/A" ? ` (${listing.side})` : ""}`;
    Alert.alert("Delete light listing", `Remove ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          void (async () => {
            setData((prev) => prev.filter((l) => l.id !== listing.id));
            await removeListing("light", listing.id, listing.server_id);
            await refresh();
            void startSync();
          })();
        },
      },
    ]);
  }

  if (loading) return <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}><LightListingsSkeleton /></View>;

  return (
    <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity style={[gridStyles.addBtn, { backgroundColor: C.primary }]} onPress={() => nav.navigate("AddEditLightListing", {})} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a light" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((l) => l.id).join("-")}
        contentContainerStyle={gridStyles.list}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
        ListEmptyComponent={<EmptyState icon="bulb-outline" title="No light listings yet" subtitle='Tap "Add a light" to list your first item.' />}
        renderSectionHeader={({ section }) => <GridSectionHeader title={section.key} count={section.count} noun="light" />}
        renderItem={({ item: row }) => (
          <View style={gridStyles.row}>
            {[0, 1].map((i) => {
              const l = row[i];
              const subtitle = [l?.side !== "N/A" ? l?.side : null, l?.model, l?.year].filter(Boolean).join(" · ");
              return (
                <View key={i} style={gridStyles.cell}>
                  {l ? (
                    <ListingCard
                      title={l.light_type}
                      subtitle={subtitle}
                      priceGhs={l.price_ghs}
                      condition={l.condition}
                      photo={parseJson<string[]>(l.photos, [])[0]}
                      inStock={l.in_stock === 1}
                      placeholderIcon="bulb-outline"
                      onPress={() => nav.navigate("AddEditLightListing", { listing: l })}
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
