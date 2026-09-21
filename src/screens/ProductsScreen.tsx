import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { ReusableText, HeightSpacer } from "../../components";
import { COLORS, SIZES, SHADOWS } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export type Product = {
  id: string;
  name: string;
  priceGhs: number;
  condition: "NEW" | "USED" | "REFURBISHED";
  description?: string;
  photos: string[];
  inStock: boolean;
  createdAt: string;
};

const CONDITION_LABEL: Record<Product["condition"], string> = {
  NEW: "New",
  USED: "Used",
  REFURBISHED: "Refurb",
};

const CONDITION_COLOR: Record<Product["condition"], string> = {
  NEW: "#16a34a",
  USED: "#d97706",
  REFURBISHED: "#0060C0",
};

export default function ProductsScreen(): React.JSX.Element {
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void load(products.length === 0);
    }, [])
  );

  async function load(initial = false): Promise<void> {
    await initDb();
    if (initial) {
      const cached = await getCachedProducts<Product>();
      if (cached.length > 0) {
        setProducts(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    try {
      const { products: p } = await api.get<{ products: Product[] }>("/vendor/products");
      setProducts(p);
      await cacheProducts(p);
    } catch (e) {
      if (products.length === 0)
        Alert.alert("Error", e instanceof Error ? e.message : "Could not load products");
    } finally {
      setLoading(false);
    }
  }

  async function toggleStock(product: Product): Promise<void> {
    try {
      await api.patch(`/vendor/products/${product.id}`, { inStock: !product.inStock });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, inStock: !p.inStock } : p)));
    } catch {
      Alert.alert("Error", "Could not update stock status");
    }
  }

  async function deleteProduct(product: Product): Promise<void> {
    Alert.alert("Delete product", `Remove "${product.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/vendor/products/${product.id}`);
            setProducts((prev) => prev.filter((p) => p.id !== product.id));
          } catch {
            Alert.alert("Error", "Could not delete product");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={COLORS.gray} />
            <HeightSpacer height={8} />
            <ReusableText text="No products yet" family="medium" size={SIZES.medium} color={COLORS.gray2} />
            <HeightSpacer height={4} />
            <ReusableText text="Tap + to add your first listing" family="regular" size={SIZES.small} color={COLORS.gray2} />
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => nav.navigate("AddEditProduct", { product: item })}
          >
            {item.photos[0] ? (
              <Image source={item.photos[0]} style={styles.thumb} contentFit="cover" cachePolicy="disk" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="image-outline" size={28} color={COLORS.gray} />
              </View>
            )}
            <View style={styles.info}>
              <ReusableText text={item.name} family="medium" size={14} color={COLORS.secondary} />
              <HeightSpacer height={2} />
              <ReusableText text={`GHS ${item.priceGhs.toLocaleString()}`} family="bold" size={15} color={COLORS.primary} />
              <HeightSpacer height={4} />
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: CONDITION_COLOR[item.condition] + "20" }]}>
                  <ReusableText text={CONDITION_LABEL[item.condition]} family="medium" size={11} color={CONDITION_COLOR[item.condition]} />
                </View>
                <TouchableOpacity
                  style={[styles.badge, { backgroundColor: item.inStock ? "#dcfce7" : "#fee2e2" }]}
                  onPress={() => void toggleStock(item)}
                >
                  <ReusableText
                    text={item.inStock ? "In Stock" : "Out of Stock"}
                    family="medium"
                    size={11}
                    color={item.inStock ? "#16a34a" : "#dc2626"}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => void deleteProduct(item)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color={COLORS.red} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => nav.navigate("AddEditProduct", {})}>
        <Ionicons name="add" size={28} color={COLORS.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.offwhite },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16, paddingBottom: 100 },
  empty: { alignItems: "center", paddingTop: 80 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    ...SHADOWS.small,
  },
  thumb: { width: 90, height: 90 },
  thumbPlaceholder: { backgroundColor: COLORS.offwhite, justifyContent: "center", alignItems: "center" },
  info: { flex: 1, padding: 10 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  deleteBtn: { padding: 12, justifyContent: "center" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOWS.medium,
  },
});
