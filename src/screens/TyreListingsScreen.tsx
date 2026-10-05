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
import {
  initDb,
  getTyreListings,
  deleteTyreListing,
  enqueueTyreListing,
  upsertTyreListing,
} from "@/lib/db";
import type { TyreListing } from "@/lib/db";
import { useSyncStore } from "@/store/sync-store";
import { ReusableText, HeightSpacer } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export type { TyreListing };

// Condition is stored as "NEW"/"USED"; vendors think in the local terms
// "Brand New" and "Home Used", so that's what we show on the tag.
const CONDITION_TAG: Record<string, { label: string; color: string }> = {
  NEW: { label: "BRAND NEW", color: "#2563eb" },
  USED: { label: "HOME USED", color: "#e08a1e" },
};

type BrandSection = {
  brand: string;
  count: number;
  // Each "row" is a pair of tyres so the SectionList renders a 2-up grid
  // while keeping sticky per-brand headers.
  data: TyreListing[][];
};

// Group listings by brand, then chunk each brand's tyres into rows of two.
function buildSections(listings: TyreListing[]): BrandSection[] {
  const byBrand = new Map<string, TyreListing[]>();
  for (const l of listings) {
    const key = l.brand.trim() || "Other";
    const arr = byBrand.get(key);
    if (arr) arr.push(l);
    else byBrand.set(key, [l]);
  }
  return Array.from(byBrand.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([brand, items]) => {
      const rows: TyreListing[][] = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { brand, count: items.length, data: rows };
    });
}

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

  const sections = useMemo(() => buildSections(listings), [listings]);

  // Flip In stock <-> Sold out instantly, without opening the edit form.
  // Optimistic local update + queue the same "update" op the edit screen uses.
  async function toggleStock(listing: TyreListing): Promise<void> {
    const next = listing.in_stock ? 0 : 1;
    setListings((prev) =>
      prev.map((l) => (l.id === listing.id ? { ...l, in_stock: next } : l))
    );
    const now = new Date().toISOString();
    await upsertTyreListing({ ...listing, in_stock: next, updated_at: now });

    let photos: string[] = [];
    try { photos = JSON.parse(listing.photos) as string[]; } catch { photos = []; }

    await enqueueTyreListing({
      id: `update-${listing.id}-${Date.now()}`,
      op: "update",
      listing_id: listing.id,
      payload: JSON.stringify({
        server_id: listing.server_id ?? null,
        width: listing.width,
        height: listing.height,
        diameter: listing.diameter,
        brand: listing.brand,
        model: listing.model,
        condition: listing.condition,
        priceGhs: listing.price_ghs,
        photos,
        inStock: next === 1,
      }),
      synced: 0,
      error: null,
      created_at: now,
    });
    void startSync();
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
            // Carry the server_id so the flush deletes it on the API too;
            // without it the delete is treated as local-only and the next
            // pull re-adds the tyre.
            payload: JSON.stringify({ server_id: listing.server_id ?? null }),
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

  function renderCard(item: TyreListing): React.JSX.Element {
    const isOut = !item.in_stock;
    const sizeLabel = `${item.width}/${item.height} R${item.diameter}`;
    const tag = CONDITION_TAG[item.condition] ?? { label: item.condition, color: C.gray2 };
    const photos: string[] = (() => {
      try { return JSON.parse(item.photos) as string[]; } catch { return []; }
    })();
    return (
      <View style={[styles.card, { backgroundColor: C.white }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => nav.navigate("AddEditTyreListing", { listing: item })}
        >
          <View style={styles.photoWrap}>
            {photos[0] ? (
              <Image
                source={{ uri: photos[0] }}
                style={styles.photo}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: C.offwhite }]}>
                <Ionicons name="car-sport-outline" size={30} color={C.gray} />
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
            <ReusableText text={sizeLabel} family="bold" size={19} color={C.secondary} />
            <HeightSpacer height={2} />
            <ReusableText text={`GH₵ ${item.price_ghs.toLocaleString()}`} family="bold" size={14} color={C.primary} />
          </View>
        </TouchableOpacity>

        {/* Tap the pill to flip stock instantly — the main day-to-day action. */}
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
        <ReusableText text="Add a tyre" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(row, index) => row.map((l) => l.id).join("-") + index}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="car-outline" size={48} color={C.gray} />
            <HeightSpacer height={12} />
            <ReusableText text="No tyre listings yet" family="medium" size={SIZES.medium} color={C.gray2} />
            <HeightSpacer height={4} />
            <ReusableText
              text='Tap "Add a tyre" to list your first tyre'
              family="regular"
              size={SIZES.small}
              color={C.gray2}
            />
          </View>
        }
        renderSectionHeader={({ section }) => {
          const s = section as unknown as BrandSection;
          return (
            <View style={[styles.brandHeader, { backgroundColor: C.offwhite }]}>
              <View style={[styles.brandLogo, { backgroundColor: C.white }]}>
                <ReusableText
                  text={s.brand.slice(0, 4).toUpperCase()}
                  family="bold"
                  size={13}
                  color={C.primary}
                />
              </View>
              <View style={{ width: 12 }} />
              <View>
                <ReusableText text={s.brand} family="bold" size={18} color={C.secondary} />
                <ReusableText text={`${s.count} ${s.count === 1 ? "tyre" : "tyres"}`} family="regular" size={12} color={C.gray2} />
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

  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  brandLogo: {
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
  info: { paddingHorizontal: 10, paddingTop: 8 },

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
