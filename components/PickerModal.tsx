import React, { useMemo, useState } from "react";
import { FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import ReusableText from "./Reusable/ReusableText";
import { SIZES, useThemeColors } from "../constants/theme";

type Props = {
  visible: boolean;
  title: string;
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  /** Show the search box once the list is longer than this. */
  searchThreshold?: number;
  emptyText?: string;
};

/** Full-screen single-select list with search. Shared by every "Select X" field. */
export function PickerModal({
  visible, title, items, selected, onSelect, onClose, searchThreshold = 8, emptyText = "No results",
}: Props): React.JSX.Element {
  const C = useThemeColors();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q ? items.filter((i) => i.toLowerCase().includes(q)) : items), [items, q]);

  const close = () => { setSearch(""); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={["top", "bottom"]} style={[styles.container, { backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.gray }]}>
          <ReusableText text={title} family="bold" size={18} color={C.secondary} />
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={C.secondary} />
          </TouchableOpacity>
        </View>
        {items.length > searchThreshold && (
          <View style={[styles.searchWrap, { backgroundColor: C.offwhite }]}>
            <Ionicons name="search-outline" size={16} color={C.gray2} />
            <TextInput
              style={[styles.searchInput, { color: C.secondary }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search…"
              placeholderTextColor={C.gray2}
              autoFocus
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        )}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                style={[styles.item, { borderBottomColor: C.gray }, active && { backgroundColor: C.primary1 }]}
                onPress={() => { onSelect(item); setSearch(""); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <ReusableText text={item} family="regular" size={SIZES.medium} color={active ? C.primary : C.secondary} />
                {active && <Ionicons name="checkmark" size={18} color={C.primary} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ReusableText text={emptyText} family="regular" size={SIZES.medium} color={C.gray2} />
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 12,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontFamily: "regular", fontSize: SIZES.medium, padding: 0 },
  list: { paddingBottom: 40 },
  item: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  empty: { padding: 32, alignItems: "center" },
});
