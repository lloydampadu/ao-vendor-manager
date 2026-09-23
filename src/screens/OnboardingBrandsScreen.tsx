import React, { useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { ReusableText, HeightSpacer } from "../../components";
import { SHADOWS, useThemeColors } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingBrands">;

const ALL = "ALL";

const MAKES = [
  "Toyota", "Nissan", "Honda", "Mercedes-Benz", "BMW",
  "Hyundai", "Kia", "Ford", "Mitsubishi", "Volkswagen",
  "Suzuki", "Isuzu", "Mazda", "Subaru", "Land Rover",
  "Lexus", "Peugeot", "Renault", "Chevrolet", "Jeep",
  "Opel", "Fiat", "Volvo", "Audi", "Skoda",
  "Citroën", "Daewoo", "Daihatsu", "Infiniti", "Acura",
];

export default function OnboardingBrandsScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const { vendor, setVendor } = useAuthStore();

  const initial = vendor?.brands ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [saving, setSaving] = useState(false);

  const allBrands = selected.has(ALL);

  function toggleAll() {
    if (allBrands) {
      setSelected(new Set());
    } else {
      setSelected(new Set([ALL]));
    }
  }

  function toggleMake(make: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(ALL);
      next.has(make) ? next.delete(make) : next.add(make);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) {
      Alert.alert("Please pick at least one brand");
      return;
    }
    setSaving(true);
    try {
      const brands = Array.from(selected);
      const { brands: saved } = await api.patch<{ brands: string[] }>(
        "/vendor-auth/brands",
        { brands }
      );
      if (vendor) setVendor({ ...vendor, brands: saved });
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = allBrands ? MAKES.length : selected.size;

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: C.offwhite }]}>
      <View style={[styles.header, { backgroundColor: C.white, borderBottomColor: C.gray }]}>
        <ReusableText text="Which car brands do you work with?" family="bold" size={22} color={C.secondary} />
        <HeightSpacer height={4} />
        <ReusableText
          text="You will only get requests for the brands you pick."
          family="regular"
          size={13}
          color={C.gray2}
        />
      </View>

      <FlatList
        data={MAKES}
        keyExtractor={(m) => m}
        contentContainerStyle={styles.list}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        ListHeaderComponent={
          <>
            <TouchableOpacity
              style={[styles.allCard, { backgroundColor: C.white, borderColor: allBrands ? C.primary : C.gray }, allBrands && { backgroundColor: C.primary1 }]}
              onPress={toggleAll}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, allBrands && { backgroundColor: C.primary, borderColor: C.primary }]}>
                {allBrands && <Ionicons name="checkmark" size={14} color={C.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <ReusableText
                  text="All brands"
                  family="bold"
                  size={15}
                  color={allBrands ? C.primary : C.secondary}
                />
                <ReusableText
                  text="Receive requests for any car brand"
                  family="regular"
                  size={12}
                  color={C.gray2}
                />
              </View>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: C.gray }]} />
              <ReusableText text="or choose specific brands" family="regular" size={12} color={C.gray2} />
              <View style={[styles.divider, { backgroundColor: C.gray }]} />
            </View>
          </>
        }
        renderItem={({ item }) => {
          const checked = !allBrands && selected.has(item);
          return (
            <TouchableOpacity
              style={[styles.makeCard, { backgroundColor: C.white, borderColor: checked ? C.primary : C.gray }, checked && { backgroundColor: C.primary1 }]}
              onPress={() => toggleMake(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, checked && { backgroundColor: C.primary, borderColor: C.primary }]}>
                {checked && <Ionicons name="checkmark" size={13} color={C.white} />}
              </View>
              <ReusableText
                text={item}
                family={checked ? "medium" : "regular"}
                size={13}
                color={checked ? C.secondary : C.gray2}
                numberOfLines={1}
              />
            </TouchableOpacity>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: C.white, borderTopColor: C.gray }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: C.primary }, (saving || selected.size === 0) && styles.saveBtnDisabled]}
          onPress={() => void save()}
          disabled={saving || selected.size === 0}
          activeOpacity={0.85}
        >
          <ReusableText
            text={
              saving
                ? "Saving…"
                : selected.size === 0
                ? "Select at least one brand"
                : allBrands
                ? "Save — All brands"
                : `Save ${selectedCount} brand${selectedCount === 1 ? "" : "s"}`
            }
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
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  list: { padding: 16, paddingBottom: 8 },
  allCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    ...SHADOWS.small,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  divider: { flex: 1, height: 1 },
  makeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
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
