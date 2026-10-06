import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, SectionList, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { errorMessage, productsApi, type ApiProduct } from "@/lib/api";
import { cacheProducts, getCachedProducts } from "@/lib/db";
import { useSyncStore } from "@/store/sync-store";
import { ReusableText, ProductsSkeletonList, EmptyState } from "../../components";
import { ListingCard, GridSectionHeader, buildGridSections, gridStyles } from "../../components/ListingCard";
import { useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

/**
 * Generic parts are online-only on the API (no local write queue), so this
 * screen reads from the server with a SQLite cache for instant first paint.
 */
export default function PartListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const isOnline = useSyncStore((s) => s.isOnline);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (showCache: boolean) => {
    if (showCache) {
      const cached = await getCachedProducts<ApiProduct>();
      if (cached.length > 0) { setProducts(cached); setLoading(false); }
    }
    try {
      const { products: fresh } = await productsApi.getAll();
      setProducts(fresh);
      setLoadError(null);
      await cacheProducts(fresh);
    } catch (e) {
      setLoadError(errorMessage(e, "Couldn't load your parts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(false); } finally { setRefreshing(false); }
  }, [load]);

  const sections = useMemo(() => buildGridSections(products, (p) => p.category ?? "Other"), [products]);

  async function toggleStock(product: ApiProduct): Promise<void> {
    const next = !product.inStock;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, inStock: next } : p)));
    try {
      await productsApi.update(product.id, { inStock: next });
    } catch (e) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, inStock: !next } : p)));
      Alert.alert("Couldn't update stock", errorMessage(e, "Changing stock needs an internet connection."));
    }
  }

  function confirmDelete(product: ApiProduct): void {
    Alert.alert("Delete part", `Remove "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await productsApi.delete(product.id);
              setProducts((prev) => prev.filter((p) => p.id !== product.id));
            } catch (e) {
              Alert.alert("Couldn't delete", errorMessage(e, "Deleting needs an internet connection."));
            }
          })();
        },
      },
    ]);
  }

  if (loading) return <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}><ProductsSkeletonList /></View>;

  return (
    <View style={[gridStyles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity style={[gridStyles.addBtn, { backgroundColor: C.primary }]} onPress={() => nav.navigate("AddPartWizard")} activeOpacity={0.85} accessibilityRole="button">
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a part" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      {loadError && products.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <ReusableText text={isOnline ? `Showing saved copy — ${loadError}` : "Showing saved copy — you're offline."} family="regular" size={11} color={C.gray2} />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(row) => row.map((p) => p.id).join("-")}
        contentContainerStyle={gridStyles.list}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.primary} />}
        ListEmptyComponent={
          loadError
            ? <EmptyState icon="cloud-offline-outline" title="Couldn't load your parts" subtitle={`${loadError} Pull down to try again.`} />
            : <EmptyState icon="cube-outline" title="No parts yet" subtitle='Tap "Add a part" to list your first part.' />
        }
        renderSectionHeader={({ section }) => <GridSectionHeader title={section.key} count={section.count} noun="part" />}
        renderItem={({ item: row }) => (
          <View style={gridStyles.row}>
            {[0, 1].map((i) => {
              const p = row[i];
              return (
                <View key={i} style={gridStyles.cell}>
                  {p ? (
                    <ListingCard
                      title={p.name}
                      titleSize={12}
                      priceGhs={p.priceGhs}
                      condition={p.condition}
                      photo={p.photos[0]}
                      inStock={p.inStock}
                      placeholderIcon="cube-outline"
                      onPress={() => nav.navigate("AddEditPartListing", { category: p.category ?? "Other", product: p })}
                      onDelete={() => confirmDelete(p)}
                      onToggleStock={() => void toggleStock(p)}
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
