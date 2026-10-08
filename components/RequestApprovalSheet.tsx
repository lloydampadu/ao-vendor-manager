import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, SectionList, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage, specialtyRequestsApi } from "@/lib/api";
import { groupOf, requestableSections } from "@/lib/approvals";
import { getCachedFluidCatalog } from "@/lib/db";
import { useAuthStore } from "@/store/auth-store";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import { SIZES, useThemeColors } from "../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Narrow the list to one catalog group (the part form). */
  category?: string;
};

/**
 * Ask an admin to approve new things to sell: a part, Tyres, Lamps or Oils & fluids. They show
 * as "Waiting for approval" and can be posted once approved.
 */
export function RequestApprovalSheet({ visible, onClose, category }: Props): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const setVendor = useAuthStore((s) => s.setVendor);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [fluidKinds, setFluidKinds] = useState<string[]>([]);
  useEffect(() => { void getCachedFluidCatalog().then((c) => setFluidKinds(c?.kinds.map((k) => k.name) ?? [])); }, []);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requestableSections(vendor?.specialties ?? [], vendor?.pendingSpecialties ?? [], category, fluidKinds)
      .map((s) => ({ title: s.title, data: q ? s.items.filter((i) => i.toLowerCase().includes(q)) : s.items }))
      .filter((s) => s.data.length > 0);
  }, [vendor?.specialties, vendor?.pendingSpecialties, category, fluidKinds, search]);

  function close(): void {
    setSearch("");
    setPicked(new Set());
    onClose();
  }

  async function send(): Promise<void> {
    if (picked.size === 0 || !vendor) return;
    setSending(true);
    try {
      // One request per group, so the admin sees where each item belongs.
      const byGroup = new Map<string, string[]>();
      for (const item of picked) byGroup.set(groupOf(item), [...(byGroup.get(groupOf(item)) ?? []), item]);
      for (const [group, items] of byGroup) await specialtyRequestsApi.submit(items, group);
      setVendor({ ...vendor, pendingSpecialties: [...vendor.pendingSpecialties, ...picked] });
      close();
      Alert.alert("Sent for approval", "You can post them once an admin approves. We'll show them here as soon as that happens.");
    } catch (e) {
      Alert.alert("Couldn't send", errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={["top", "bottom"]} style={[styles.root, { backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.gray }]}>
          <ReusableText text="Ask for approval" family="bold" size={18} color={C.secondary} />
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={C.secondary} />
          </TouchableOpacity>
        </View>
        <View style={[styles.note, { backgroundColor: C.offwhite }]}>
          <Ionicons name="information-circle-outline" size={16} color={C.gray2} />
          <ReusableText text="Pick what else you sell. An admin checks it, then you can post it." family="regular" size={13} color={C.gray2} />
        </View>
        <View style={[styles.search, { backgroundColor: C.offwhite }]}>
          <Ionicons name="search-outline" size={16} color={C.gray2} />
          <TextInput style={[styles.searchInput, { color: C.secondary }]} value={search} onChangeText={setSearch} placeholder="Search…" placeholderTextColor={C.gray2} />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ReusableText text={search ? "Nothing matches your search." : "Everything here is already approved or waiting."} family="regular" size={13} color={C.gray2} />
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: C.offwhite }]}>
              <ReusableText text={section.title} family="bold" size={13} color={C.secondary} />
            </View>
          )}
          renderItem={({ item }) => {
            const checked = picked.has(item);
            return (
              <TouchableOpacity
                style={[styles.item, { borderBottomColor: C.gray }, checked && { backgroundColor: C.primary1 }]}
                onPress={() => setPicked((prev) => { const next = new Set(prev); if (checked) next.delete(item); else next.add(item); return next; })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <ReusableText text={item === "Tyres" ? "Tyres (every kind)" : item} family="regular" size={SIZES.medium} color={checked ? C.primary : C.secondary} />
                <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? C.primary : C.gray2} />
              </TouchableOpacity>
            );
          }}
        />
        {picked.size > 0 && (
          <View style={[styles.footer, { backgroundColor: C.white, borderTopColor: C.gray }]}>
            <ReusableBtn
              onPress={() => void send()}
              btnText={sending ? "Sending…" : `Ask for ${picked.size} item${picked.size > 1 ? "s" : ""}`}
              backgroundColor={sending ? C.gray2 : C.primary}
              textColor={C.white}
              height={48}
              disabled={sending}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 8, padding: 10 },
  search: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontFamily: "regular", fontSize: SIZES.medium, padding: 0 },
  sectionHeader: { paddingHorizontal: 20, paddingVertical: 8 },
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  footer: { padding: 16, borderTopWidth: 1 },
  empty: { padding: 24, alignItems: "center" },
});
