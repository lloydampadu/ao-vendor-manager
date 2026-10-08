import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import HeightSpacer from "./Reusable/HeightSpacer";
import { SHADOWS, useThemeColors } from "../constants/theme";

export const CONDITION_TAG: Record<string, { label: string; color: string }> = {
  NEW: { label: "BRAND NEW", color: "#2563eb" },
  USED: { label: "HOME USED", color: "#e08a1e" },
  REFURBISHED: { label: "REFURB", color: "#7c3aed" },
};

type Props = {
  title: string;
  subtitle?: string;
  priceGhs: number;
  condition: string;
  photo?: string;
  inStock: boolean;
  placeholderIcon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onDelete: () => void;
  onToggleStock: () => void;
  titleSize?: number;
  /** Small warning line under the price (e.g. the tyre price note). */
  note?: string | null;
};

/** One tile in a 2-up listing grid (tyres, lights, generic parts). */
export function ListingCard({ title, subtitle, priceGhs, condition, photo, inStock, placeholderIcon, onPress, onDelete, onToggleStock, titleSize = 14, note }: Props) {
  const C = useThemeColors();
  const tag = CONDITION_TAG[condition] ?? { label: condition, color: C.gray2 };
  return (
    <View style={[styles.card, { backgroundColor: C.white }]}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
        <View style={styles.photoWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" cachePolicy="disk" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: C.offwhite }]}>
              <Ionicons name={placeholderIcon} size={30} color={C.gray} />
            </View>
          )}
          <View style={[styles.condTag, { backgroundColor: tag.color }]}>
            <ReusableText text={tag.label} family="bold" size={10} color="#fff" />
          </View>
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Delete ${title}`}>
            <Ionicons name="trash-outline" size={14} color={C.red} />
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <ReusableText text={title} family="bold" size={titleSize} color={C.secondary} numberOfLines={2} />
          {subtitle ? (<><HeightSpacer height={2} /><ReusableText text={subtitle} family="regular" size={11} color={C.gray2} numberOfLines={1} /></>) : null}
          <HeightSpacer height={4} />
          <ReusableText text={`GH₵ ${priceGhs.toLocaleString()}`} family="bold" size={14} color={C.primary} />
          {note ? (<><HeightSpacer height={2} /><ReusableText text={note} family="regular" size={10} color={C.warning} /></>) : null}
        </View>
      </TouchableOpacity>

      {/* Tap the pill to flip stock instantly — the main day-to-day action. */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onToggleStock}
        style={[styles.stockPill, inStock ? styles.stockOk : styles.stockOut]}
        accessibilityRole="switch"
        accessibilityState={{ checked: inStock }}
      >
        <View style={[styles.dot, { backgroundColor: inStock ? C.green : C.red }]} />
        <View style={{ width: 6 }} />
        <ReusableText text={inStock ? "In stock" : "Sold out"} family="bold" size={12} color={inStock ? C.green : C.red} />
      </TouchableOpacity>
    </View>
  );
}

/** Groups items and chunks each group into rows of two for a SectionList grid. */
export function buildGridSections<T>(items: T[], keyOf: (item: T) => string): { key: string; count: number; data: T[][] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item).trim() || "Other";
    const arr = groups.get(k);
    if (arr) arr.push(item); else groups.set(k, [item]);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const rows: T[][] = [];
      for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
      return { key, count: list.length, data: rows };
    });
}

export function GridSectionHeader({ title, count, noun }: { title: string; count: number; noun: string }) {
  const C = useThemeColors();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: C.offwhite }]}>
      <View style={[styles.sectionLogo, { backgroundColor: C.white }]}>
        <ReusableText text={title.slice(0, 4).toUpperCase()} family="bold" size={13} color={C.primary} />
      </View>
      <View style={{ width: 12 }} />
      <View>
        <ReusableText text={title} family="bold" size={18} color={C.secondary} />
        <ReusableText text={`${count} ${count === 1 ? noun : `${noun}s`}`} family="regular" size={12} color={C.gray2} />
      </View>
    </View>
  );
}

export const gridStyles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", margin: 14, borderRadius: 12, paddingVertical: 14 },
  list: { paddingHorizontal: 10, paddingBottom: 30, flexGrow: 1 },
  row: { flexDirection: "row", marginBottom: 12 },
  cell: { flex: 1, paddingHorizontal: 4 },
});

const styles = StyleSheet.create({
  card: { borderRadius: 14, overflow: "hidden", ...SHADOWS.small },
  photoWrap: { position: "relative" },
  photo: { width: "100%", height: 104 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  condTag: { position: "absolute", top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  deleteBtn: { position: "absolute", top: 6, right: 6, backgroundColor: "#ffffffcc", padding: 5, borderRadius: 8 },
  info: { paddingHorizontal: 10, paddingTop: 8 },
  stockPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", margin: 10, marginTop: 8, paddingVertical: 9, borderRadius: 10 },
  stockOk: { backgroundColor: "#dcfce7" },
  stockOut: { backgroundColor: "#fee2e2" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 6 },
  sectionLogo: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", ...SHADOWS.small },
});
