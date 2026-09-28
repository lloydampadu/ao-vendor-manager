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
import { initDb, getTyreListings, deleteTyreListing, enqueueTyreListing } from "@/lib/db";
import type { TyreListing } from "@/lib/db";
import { useSyncStore } from "@/store/sync-store";
import { ReusableText, HeightSpacer } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export type { TyreListing };

export default function TyreListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const { startSync } = useSyncStore();
  const [listings, setListings] = useState<TyreListing[]>([]);
  const [loading, setLoading] = useState(true);
  const firstLoadDone = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [])
  );

  async function load(): Promise<void> {
    await initDb();
    try {
      const rows = await getTyreListings();
      setListings(rows);
    } catch (e) {
      if (!firstLoadDone.current)
        Alert.alert("Error", e instanceof Error ? e.message : "Could not load tyre listings");
    } finally {
      firstLoadDone.current = true;
      setLoading(false);
    }
  }

  async function handleDelete(listing: TyreListing): Promise<void> {
    const sizeLabel = `${listing.width}/${listing.height} R${listing.diameter}`;
    Alert.alert("Delete tyre listing", `Remove "${listing.brand} ${listing.model} ${sizeLabel}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const now = new Date().toISOString();
          await enqueueTyreListing({
            id: `del-${listing.id}-${Date.now()}`,
            op: "delete",
            listing_id: listing.id,
            payload: "{}",
            synced: 0,
            error: null,
            created_at: now,
          });
          await deleteTyreListing(listing.id);
          setListings((prev) => prev.filter((l) => l.id !== listing.id));
          void startSync();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.offwhite, justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="hourglass-outline" size={32} color={C.gray2} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: C.primary }]}
        onPress={() => nav.navigate("AddEditTyreListing", {})}
        activeOpacity={0.85}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a tyre listing" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={48} color={C.gray} />
            <HeightSpacer height={12} />
            <ReusableText text="No tyre listings yet" family="medium" size={SIZES.medium} color={C.gray2} />
            <HeightSpacer height={4} />
            <ReusableText
              text='Tap "Add a tyre listing" to list your first tyre'
              family="regular"
              size={SIZES.small}
              color={C.gray2}
            />
          </View>
        }
        renderItem={({ item }) => {
          const isOut = !item.in_stock;
          const sizeLabel = `${item.width}/${item.height} R${item.diameter}`;
          const photos: string[] = (() => { try { return JSON.parse(item.photos) as string[]; } catch { return []; } })();
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: C.white }]}
              onPress={() => nav.navigate("AddEditTyreListing", { listing: item })}
              activeOpacity={0.8}
            >
              <View style={styles.cardBody}>
                {photos[0] ? (
                  <Image
                    source={{ uri: photos[0] }}
                    style={styles.thumb}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: C.offwhite }]}>
                    <Ionicons name="car-sport-outline" size={28} color={C.gray} />
                  </View>
                )}
                <View style={styles.info}>
                  <ReusableText text={sizeLabel} family="bold" size={15} color={C.secondary} />
                  <HeightSpacer height={2} />
                  <ReusableText
                    text={`${item.brand} ${item.model}`}
                    family="regular"
                    size={12}
                    color={C.gray2}
                    numberOfLines={1}
                  />
                  <HeightSpacer height={4} />
                  <ReusableText text={`GH₵ ${item.price_ghs.toLocaleString()}`} family="bold" size={14} color={C.primary} />
                  <HeightSpacer height={6} />
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, isOut ? styles.statusOut : styles.statusOk]}>
                      <ReusableText
                        text={isOut ? "Out of stock" : "Available"}
                        family="medium"
                        size={11}
                        color={isOut ? C.red : C.green}
                      />
                    </View>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => void handleDelete(item)}
                style={[styles.deleteBtn, { backgroundColor: C.white + "cc" }]}
              >
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
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    ...SHADOWS.small,
  },
  cardBody: { flexDirection: "row", alignItems: "center" },
  thumb: {
    width: 70,
    height: 70,
    margin: 10,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    width: 70,
    height: 70,
    justifyContent: "center",
    alignItems: "center",
    margin: 10,
    borderRadius: 8,
  },
  info: { flex: 1, paddingVertical: 10, paddingRight: 40 },
  statusRow: { flexDirection: "row" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusOk:  { backgroundColor: "#dcfce7" },
  statusOut: { backgroundColor: "#fee2e2" },
  deleteBtn: { position: "absolute", top: 6, right: 6, padding: 4, borderRadius: 6 },
});
