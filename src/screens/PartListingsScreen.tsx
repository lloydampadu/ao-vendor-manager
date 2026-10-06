import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { initDb, cacheProducts, getCachedProducts } from "@/lib/db";
import { ReusableText, HeightSpacer, ProductsSkeletonList } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export type PartProduct = {
  id: string;
  name: string;
  priceGhs: number;
  condition: "NEW" | "USED" | "REFURBISHED";
  description?: string;
  photos: string[];
  inStock: boolean;
  category?: string;
  createdAt: string;
};

const CONDITION_TAG: Record<string, { label: string; color: string }> = {
  NEW: { label: "BRAND NEW", color: "#2563eb" },
  USED: { label: "HOME USED", color: "#e08a1e" },
  REFURBISHED: { label: "REFURB", color: "#7c3aed" },
};

type CategorySection = {
  category: string;
  count: number;
  data: PartProduct[][];
};

function buildSections(products: PartProduct[]): CategorySection[] {
  const byCategory = new Map<string, PartProduct[]>();
  for (const p of products) {
    const key = p.category?.trim() || "Other";
    const arr = byCategory.get(key);
    if (arr) arr.push(p);
    else byCategory.set(key, [p]);
  }
  return Array.from(byCategory.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, items]) => {
      const rows: PartProduct[][] = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { category, count: items.length, data: rows };
    });
}

export default function PartListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const [products, setProducts] = useState<PartProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoadDone = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void load(!firstLoadDone.current);
    }, [])
  );

  async function load(initial = false): Promise<void> {
    await initDb();
    if (initial) {
      const cached = await getCachedProducts<PartProduct>();
      if (cached.length > 0) {
        setProducts(cached);
        setLoading(false);
      }
    }
    try {
      const { products: p } = await api.get<{ products: PartProduct[] }>("/vendor/products");
      setProducts(p);
      await cacheProducts(p);
    } catch {
      if (!firstLoadDone.current)
        Alert.alert("Couldn't load parts", "Check your connection and pull down to refresh.");
    } finally {
      firstLoadDone.current = true;
      setLoading(false);
    }
  }

  const sections = useMemo(() => buildSections(products), [products]);

  async function toggleStock(product: PartProduct): Promise<void> {
    try {
      await api.patch(`/vendor/products/${product.id}`, { inStock: !product.inStock });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, inStock: !p.inStock } : p))
      );
    } catch {
      Alert.alert("Couldn't update stock", "Please check your connection and try again.");
    }
  }

  async function handleDelete(product: PartProduct): Promise<void> {
    Alert.alert("Delete part", `Remove "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vendor/products/${product.id}`);
            setProducts((prev) => prev.filter((p) => p.id !== product.id));
          } catch {
            Alert.alert("Couldn't delete", "Something went wrong. Please try again.");
          }
        },
      },
    ]);
  }

  function renderCard(item: PartProduct): React.JSX.Element {
    const isOut = !item.inStock;
    const tag = CONDITION_TAG[item.condition] ?? { label: item.condition, color: C.gray2 };
    return (
      <View style={[styles.card, { backgroundColor: C.white }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => nav.navigate("AddPartWizard")}
        >
          <View style={styles.photoWrap}>
            {item.photos[0] ? (
              <Image
                source={{ uri: item.photos[0] }}
                style={styles.photo}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: C.offwhite }]}>
                <Ionicons name="cube-outline" size={30} color={C.gray} />
              </View>
            )}
            <View style={[styles.condTag, { backgroundColor: tag.color }]}>
              <ReusableText text={tag.label} family="bold" size={10} color="#fff" />
            </View>
            <TouchableOpacity
              onPress={() => void handleDelete(item)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color={C.red} />
            </TouchableOpacity>
          </View>
          <View style={styles.info}>
            <ReusableText text={item.name} family="bold" size={12} color={C.secondary} numberOfLines={2} />
            <HeightSpacer height={4} />
            <ReusableText text={`GH₵ ${item.priceGhs.toLocaleString()}`} family="bold" size={14} color={C.primary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => void toggleStock(item)}
          style={[styles.stockPill, isOut ? styles.stockOut : styles.stockOk]}
        >
          <View style={[styles.dot, { backgroundColor: isOut ? C.red : C.green }]} />
          <View style={{ width: 6 }} />
          <ReusableText
            text={isOut ? "Sold out" : "In stock"}
            family="bold"
            size={12}
            color={isOut ? C.red : C.green}
          />
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.offwhite }]}>
        <ProductsSkeletonList />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: C.primary }]}
        onPress={() => nav.navigate("AddPartWizard")}
        activeOpacity={0.85}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a part" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(row, index) => row.map((p) => p.id).join("-") + index}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={C.gray} />
            <HeightSpacer height={12} />
            <ReusableText text="No parts yet" family="medium" size={SIZES.medium} color={C.gray2} />
            <HeightSpacer height={4} />
            <ReusableText
              text='Tap "Add a part" to list your first part'
              family="regular"
              size={SIZES.small}
              color={C.gray2}
            />
          </View>
        }
        renderSectionHeader={({ section }) => {
          const s = section as unknown as CategorySection;
          return (
            <View style={[styles.categoryHeader, { backgroundColor: C.offwhite }]}>
              <View style={[styles.categoryLogo, { backgroundColor: C.white }]}>
                <ReusableText
                  text={s.category.slice(0, 4).toUpperCase()}
                  family="bold"
                  size={13}
                  color={C.primary}
                />
              </View>
              <View style={{ width: 12 }} />
              <View>
                <ReusableText text={s.category} family="bold" size={18} color={C.secondary} />
                <ReusableText
                  text={`${s.count} ${s.count === 1 ? "part" : "parts"}`}
                  family="regular"
                  size={12}
                  color={C.gray2}
                />
              </View>
            </View>
          );
        }}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            <View style={styles.cell}>{renderCard(row[0])}</View>
            <View style={styles.cell}>{row[1] ? renderCard(row[1]) : null}</View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 14,
    borderRadius: 12,
    paddingVertical: 14,
  },
  list: { paddingHorizontal: 10, paddingBottom: 30 },
  empty: { alignItems: "center", paddingTop: 80 },

  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  categoryLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOWS.small,
  },

  row: { flexDirection: "row", marginBottom: 12 },
  cell: { flex: 1, paddingHorizontal: 4 },

  card: {
    borderRadius: 14,
    overflow: "hidden",
    ...SHADOWS.small,
  },
  photoWrap: { position: "relative" },
  photo: { width: "100%", height: 104 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  condTag: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#ffffffcc",
    padding: 5,
    borderRadius: 8,
  },
  info: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },

  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 10,
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 10,
  },
  stockOk: { backgroundColor: "#dcfce7" },
  stockOut: { backgroundColor: "#fee2e2" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
