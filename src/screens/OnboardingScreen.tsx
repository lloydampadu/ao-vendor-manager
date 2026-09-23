import React, { useState, useCallback } from "react";
import {
  Alert,
  SectionList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { PART_CATEGORIES, CATEGORY_ICONS } from "@/lib/parts-catalog";
import { ReusableText, HeightSpacer } from "../../components";
import { SIZES, SHADOWS, useThemeColors } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

const CATEGORIES = Object.keys(PART_CATEGORIES);

type SectionData = { category: string; item: string };

export default function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const { vendor, setVendor } = useAuthStore();

  const [selected, setSelected] = useState<Set<string>>(
    new Set(vendor?.specialties ?? [])
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleItem = useCallback((item: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  }, []);

  const toggleSection = useCallback((category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }, []);

  const toggleAll = useCallback((category: string) => {
    const parts = PART_CATEGORIES[category] ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = parts.every((p) => next.has(p));
      if (allSelected) {
        parts.forEach((p) => next.delete(p));
      } else {
        parts.forEach((p) => next.add(p));
      }
      return next;
    });
  }, []);

  const lowerSearch = search.toLowerCase();

  const sections = CATEGORIES.map((category) => {
    const parts = PART_CATEGORIES[category] ?? [];
    const filtered = lowerSearch
      ? parts.filter((p) => p.toLowerCase().includes(lowerSearch))
      : parts;
    return { title: category, data: filtered.map((item) => ({ category, item })) };
  }).filter((s) => {
    if (lowerSearch) return s.data.length > 0;
    return expanded.has(s.title) ? true : s.data.length > 0;
  });

  const visibleSections = lowerSearch
    ? sections
    : sections.map((s) => ({
        ...s,
        data: expanded.has(s.title) ? s.data : [],
      }));

  async function save() {
    if (selected.size === 0) {
      Alert.alert("Select at least one part you sell");
      return;
    }
    setSaving(true);
    try {
      const specialties = Array.from(selected);
      const { specialties: saved, categories } = await api.patch<{
        specialties: string[];
        categories: string[];
      }>("/vendor-auth/specialties", { specialties });
      if (vendor) {
        setVendor({ ...vendor, specialties: saved, categories });
      }
      navigation.navigate("OnboardingBrands");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const totalSelected = selected.size;

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: C.offwhite }]}>
      <View style={[styles.header, { backgroundColor: C.white, borderBottomColor: C.gray }]}>
        <ReusableText text="What do you sell?" family="bold" size={22} color={C.secondary} />
        <HeightSpacer height={4} />
        <ReusableText
          text="Pick all the parts you sell. Only pick what you actually have."
          family="regular"
          size={13}
          color={C.gray2}
        />
        <HeightSpacer height={12} />
        <View style={[styles.searchRow, { backgroundColor: C.offwhite, borderColor: C.gray }]}>
          <Ionicons name="search-outline" size={16} color={C.gray2} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: C.secondary }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search parts…"
            placeholderTextColor={C.gray2}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <SectionList
        sections={visibleSections}
        keyExtractor={(item) => item.item}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => {
          const isOpen = lowerSearch ? true : expanded.has(section.title);
          const count = (PART_CATEGORIES[section.title] ?? []).filter((p) =>
            selected.has(p)
          ).length;
          const icon = CATEGORY_ICONS[section.title] ?? "cube-outline";

          return (
            <TouchableOpacity
              style={[styles.sectionHeader, { backgroundColor: C.white, borderColor: C.gray }]}
              onPress={() => toggleSection(section.title)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionLeft}>
                <View style={[styles.catIcon, { backgroundColor: count > 0 ? C.primary : C.gray }]}>
                  <Ionicons
                    name={icon as any}
                    size={18}
                    color={C.white}
                  />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <ReusableText text={section.title} family="bold" size={15} color={C.secondary} />
                  {count > 0 && (
                    <ReusableText text={`${count} selected`} family="regular" size={12} color={C.primary} />
                  )}
                </View>
              </View>
              <View style={styles.sectionRight}>
                {count > 0 && !isOpen && (
                  <TouchableOpacity
                    onPress={() => toggleAll(section.title)}
                    style={styles.clearBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ReusableText text="Clear" family="regular" size={12} color={C.red} />
                  </TouchableOpacity>
                )}
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={C.gray2} />
              </View>
            </TouchableOpacity>
          );
        }}
        renderItem={({ item }: { item: SectionData }) => {
          const checked = selected.has(item.item);
          return (
            <TouchableOpacity
              style={[styles.item, { backgroundColor: C.white, borderBottomColor: C.offwhite }]}
              onPress={() => toggleItem(item.item)}
              activeOpacity={0.6}
            >
              <View style={[styles.checkbox, checked && { backgroundColor: C.primary, borderColor: C.primary }]}>
                {checked && <Ionicons name="checkmark" size={13} color={C.white} />}
              </View>
              <ReusableText
                text={item.item}
                family={checked ? "medium" : "regular"}
                size={14}
                color={checked ? C.secondary : C.gray2}
              />
            </TouchableOpacity>
          );
        }}
        renderSectionFooter={({ section }) => {
          const isOpen = lowerSearch ? true : expanded.has(section.title);
          if (!isOpen || section.data.length === 0) return null;
          const allSelected = (PART_CATEGORIES[section.title] ?? []).every((p) =>
            selected.has(p)
          );
          return (
            <TouchableOpacity
              style={[styles.selectAllRow, { backgroundColor: C.white, borderBottomColor: C.gray }]}
              onPress={() => toggleAll(section.title)}
            >
              <ReusableText
                text={allSelected ? "Deselect all" : "Select all in this category"}
                family="regular"
                size={12}
                color={C.primary}
              />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ReusableText text="No parts match your search" family="regular" size={14} color={C.gray2} />
          </View>
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: C.white, borderTopColor: C.gray }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: C.primary }, (saving || totalSelected === 0) && styles.saveBtnDisabled]}
          onPress={() => void save()}
          disabled={saving || totalSelected === 0}
          activeOpacity={0.85}
        >
          <ReusableText
            text={saving ? "Saving…" : totalSelected === 0 ? "Select parts to continue" : `Save ${totalSelected} part${totalSelected === 1 ? "" : "s"}`}
            family="bold"
            size={16}
            color={C.white}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.small,
    fontFamily: "regular",
    padding: 0,
  },
  list: { paddingBottom: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  sectionRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  selectAllRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    alignItems: "flex-end",
  },
  clearBtn: { paddingHorizontal: 4 },
  empty: { padding: 40, alignItems: "center" },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    ...SHADOWS.small,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
});
