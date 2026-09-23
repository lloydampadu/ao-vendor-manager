import React, { useCallback, useRef, useState } from "react";
import {
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
import { ReusableText, HeightSpacer, ProductsSkeletonList } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
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

export default function ProductsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const [products, setProducts] = useState<Product[]>([]);
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
      const cached = await getCachedProducts<Product>();
      if (cached.length > 0) {
        setProducts(cached);
        setLoading(false);
      }
    }
    try {
      const { products: p } = await api.get<{ products: Product[] }>("/vendor/products");
      setProducts(p);
      await cacheProducts(p);
    } catch (e) {
      if (!firstLoadDone.current)
        Alert.alert("Error", e instanceof Error ? e.message : "Could not load products");
    } finally {
      firstLoadDone.current = true;
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
      <View style={[styles.container, { backgroundColor: C.offwhite }]}>
        <ProductsSkeletonList />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity style={[styles.addBtn, { backgroundColor: C.primary }]} onPress={() => nav.navigate("AddPartWizard")} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a part" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={C.gray} />
            <HeightSpacer height={12} />
            <ReusableText text="No parts yet" family="medium" size={SIZES.medium} color={C.gray2} />
            <HeightSpacer height={4} />
            <ReusableText text='Tap "Add a part" to list your first part' family="regular" size={SIZES.small} color={C.gray2} />
          </View>
        }
        renderItem={({ item }) => {
          const isOut = !item.inStock;
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: C.white }]}
              onPress={() => nav.navigate("AddEditProduct", { product: item })}
              activeOpacity={0.8}
            >
              {item.photos[0] ? (
                <Image source={item.photos[0]} style={styles.thumb} contentFit="cover" cachePolicy="disk" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: C.offwhite, justifyContent: "center", alignItems: "center" }]}>
                  <Ionicons name="image-outline" size={28} color={C.gray} />
                </View>
              )}
              <View style={styles.info}>
                <ReusableText text={`GH₵ ${item.priceGhs.toLocaleString()}`} family="bold" size={15} color={C.secondary} />
                <HeightSpacer height={3} />
                <ReusableText text={item.name} family="regular" size={12} color={C.gray2} numberOfLines={1} />
                <HeightSpacer height={8} />
                <View style={styles.statusRow}>
                  <TouchableOpacity
                    style={[styles.statusBadge, isOut ? styles.statusOut : styles.statusOk]}
                    onPress={() => void toggleStock(item)}
                  >
                    <ReusableText
                      text={isOut ? "Out of stock" : "Available"}
                      family="medium"
                      size={11}
                      color={isOut ? C.red : C.green}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity onPress={() => void deleteProduct(item)} style={[styles.deleteBtn, { backgroundColor: C.white + "cc" }]}>
                <Ionicons name="trash-outline" size={15} color={C.red} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
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
  list: { paddingHorizontal: 14, paddingBottom: 30 },
  empty: { alignItems: "center", paddingTop: 80 },
  card: {
    flex: 1,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    ...SHADOWS.small,
  },
  thumb: { width: "100%", height: 110 },
  info: { padding: 10 },
  statusRow: { flexDirection: "row" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusOk:  { backgroundColor: "#dcfce7" },
  statusOut: { backgroundColor: "#fee2e2" },
  deleteBtn: { position: "absolute", top: 6, right: 6, padding: 4, borderRadius: 6 },
});
