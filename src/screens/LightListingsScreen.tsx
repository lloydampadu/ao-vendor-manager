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
  getLightListings,
  deleteLightListing,
  enqueueLightListing,
  upsertLightListing,
} from "@/lib/db";
import type { LightListing } from "@/lib/db";
import { useSyncStore } from "@/store/sync-store";
import { ReusableText, HeightSpacer, LightListingsSkeleton } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

export type { LightListing };

const CONDITION_TAG: Record<string, { label: string; color: string }> = {
  NEW: { label: "BRAND NEW", color: "#2563eb" },
  USED: { label: "HOME USED", color: "#e08a1e" },
};

type MakeSection = {
  make: string;
  count: number;
  data: LightListing[][];
};

function buildSections(listings: LightListing[]): MakeSection[] {
  const byMake = new Map<string, LightListing[]>();
  for (const l of listings) {
    const key = l.make.trim() || "Other";
    const arr = byMake.get(key);
    if (arr) arr.push(l);
    else byMake.set(key, [l]);
  }
  return Array.from(byMake.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([make, items]) => {
      const rows: LightListing[][] = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { make, count: items.length, data: rows };
    });
}

export default function LightListingsScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const { startSync } = useSyncStore();
  const [listings, setListings] = useState<LightListing[]>([]);
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
      const rows = await getLightListings();
      setListings(rows);
    } catch {
      if (!firstLoadDone.current)
        Alert.alert("Couldn't load lights", "Check your connection and pull down to refresh.");
    } finally {
      firstLoadDone.current = true;
      setLoading(false);
    }
  }

  const sections = useMemo(() => buildSections(listings), [listings]);

  async function toggleStock(listing: LightListing): Promise<void> {
    const next = listing.in_stock ? 0 : 1;
    setListings((prev) =>
      prev.map((l) => (l.id === listing.id ? { ...l, in_stock: next } : l))
    );
    const now = new Date().toISOString();
    await upsertLightListing({ ...listing, in_stock: next, updated_at: now });

    let photos: string[] = [];
    try { photos = JSON.parse(listing.photos) as string[]; } catch { photos = []; }

    await enqueueLightListing({
      id: `update-${listing.id}-${Date.now()}`,
      op: "update",
      listing_id: listing.id,
      payload: JSON.stringify({
        server_id: listing.server_id ?? null,
        lightType: listing.light_type,
        side: listing.side,
        make: listing.make,
        model: listing.model,
        year: listing.year,
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

  async function handleDelete(listing: LightListing): Promise<void> {
    Alert.alert("Delete light listing", `Remove "${listing.light_type}${listing.side !== "N/A" ? ` (${listing.side})` : ""}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const now = new Date().toISOString();
          await enqueueLightListing({
            id: `del-${listing.id}-${Date.now()}`,
            op: "delete",
            listing_id: listing.id,
            payload: JSON.stringify({ server_id: listing.server_id ?? null }),
            synced: 0,
            error: null,
            created_at: now,
          });
          await deleteLightListing(listing.id);
          setListings((prev) => prev.filter((l) => l.id !== listing.id));
          void startSync();
        },
      },
    ]);
  }

  function renderCard(item: LightListing): React.JSX.Element {
    const isOut = !item.in_stock;
    const tag = CONDITION_TAG[item.condition] ?? { label: item.condition, color: C.gray2 };
    const photos: string[] = (() => {
      try { return JSON.parse(item.photos) as string[]; } catch { return []; }
    })();
    const subtitle = [item.side !== "N/A" ? item.side : null, item.make, item.model, item.year]
      .filter(Boolean)
      .join(" · ");

    return (
      <View style={[styles.card, { backgroundColor: C.white }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => nav.navigate("AddEditLightListing", { listing: item })}
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
                <Ionicons name="bulb-outline" size={30} color={C.gray} />
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
            <ReusableText text={item.light_type} family="bold" size={14} color={C.secondary} numberOfLines={2} />
            {subtitle.length > 0 && (
              <>
                <HeightSpacer height={2} />
                <ReusableText text={subtitle} family="regular" size={11} color={C.gray2} numberOfLines={1} />
              </>
            )}
            <HeightSpacer height={4} />
            <ReusableText text={`GH₵ ${item.price_ghs.toLocaleString()}`} family="bold" size={14} color={C.primary} />
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
        <LightListingsSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.offwhite }]}>
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: C.primary }]}
        onPress={() => nav.navigate("AddEditLightListing", {})}
        activeOpacity={0.85}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <View style={{ width: 8 }} />
        <ReusableText text="Add a light" family="bold" size={15} color="#fff" />
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(row, index) => row.map((l) => l.id).join("-") + index}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bulb-outline" size={48} color={C.gray} />
            <HeightSpacer height={12} />
            <ReusableText text="No light listings yet" family="medium" size={SIZES.medium} color={C.gray2} />
            <HeightSpacer height={4} />
            <ReusableText
              text='Tap "Add a light" to list your first item'
              family="regular"
              size={SIZES.small}
              color={C.gray2}
            />
          </View>
        }
        renderSectionHeader={({ section }) => {
          const s = section as unknown as MakeSection;
          return (
            <View style={[styles.makeHeader, { backgroundColor: C.offwhite }]}>
              <View style={[styles.makeLogo, { backgroundColor: C.white }]}>
                <ReusableText
                  text={s.make.slice(0, 4).toUpperCase()}
                  family="bold"
                  size={13}
                  color={C.primary}
                />
              </View>
              <View style={{ width: 12 }} />
              <View>
                <ReusableText text={s.make} family="bold" size={18} color={C.secondary} />
                <ReusableText text={`${s.count} ${s.count === 1 ? "light" : "lights"}`} family="regular" size={12} color={C.gray2} />
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

  makeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  makeLogo: {
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
