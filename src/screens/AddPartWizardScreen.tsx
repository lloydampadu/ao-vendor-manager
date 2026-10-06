import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReusableText } from "../../components";
import { useThemeColors } from "../../constants/theme";
import { useAuthStore } from "@/store/auth-store";
import { PART_CATEGORIES } from "@/lib/parts-catalog";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ProductsStackParamList, "AddPartWizard">;
};

type CategoryTile = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  partCategory: string | null;   // key into PART_CATEGORIES / AddEditPartListing param
  vendorCategory: string;        // VendorCategory enum value stored on vendor.categories
};

const TILES: CategoryTile[] = [
  { label: "Body",         icon: "car-outline",              partCategory: "Body",                  vendorCategory: "BODY" },
  { label: "Engine",       icon: "settings-outline",         partCategory: "Engine",                vendorCategory: "ENGINE" },
  { label: "Brakes",       icon: "disc-outline",             partCategory: "Axle & Brakes",         vendorCategory: "AXLE_BRAKES" },
  { label: "Electrical",   icon: "flash-outline",            partCategory: "Electrical",            vendorCategory: "ELECTRICAL" },
  { label: "Tyres",        icon: "ellipse-outline",          partCategory: null,                    vendorCategory: "TYRES" },
  { label: "Lamps",        icon: "bulb-outline",             partCategory: null,                    vendorCategory: "LAMPS" },
  { label: "Suspension",   icon: "git-branch-outline",       partCategory: "Steering & Suspension", vendorCategory: "STEERING_SUSPENSION" },
  { label: "Transmission", icon: "swap-horizontal-outline",  partCategory: "Transmission",          vendorCategory: "TRANSMISSION" },
  { label: "Interior",     icon: "grid-outline",             partCategory: "Interior",              vendorCategory: "INTERIOR" },
  { label: "Glass",        icon: "tablet-landscape-outline", partCategory: "Glass",                 vendorCategory: "GLASS" },
  { label: "Cooling",      icon: "thermometer-outline",      partCategory: "Heating & Cooling",     vendorCategory: "HEATING_COOLING" },
  { label: "Air & Fuel",   icon: "flame-outline",            partCategory: "Air & Fuel",            vendorCategory: "AIR_FUEL" },
];

// Reverse map: part name → vendorCategory enum value
const PART_TO_VENDOR_CATEGORY: Record<string, string> = {};
const PART_CAT_TO_VENDOR_CAT: Record<string, string> = {
  "Air & Fuel": "AIR_FUEL",
  "Axle & Brakes": "AXLE_BRAKES",
  "Body": "BODY",
  "Electrical": "ELECTRICAL",
  "Engine": "ENGINE",
  "Glass": "GLASS",
  "Heating & Cooling": "HEATING_COOLING",
  "Interior": "INTERIOR",
  "Lamps": "LAMPS",
  "Steering & Suspension": "STEERING_SUSPENSION",
  "Transmission": "TRANSMISSION",
};
for (const [partCat, parts] of Object.entries(PART_CATEGORIES)) {
  const vendorCat = PART_CAT_TO_VENDOR_CAT[partCat];
  if (vendorCat) {
    for (const part of parts) PART_TO_VENDOR_CATEGORY[part] = vendorCat;
  }
}

export default function AddPartWizardScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const vendor = useAuthStore((s) => s.vendor);

  const vendorCats = new Set(vendor?.categories ?? []);
  const isGeneral = vendorCats.size === 0 || vendorCats.has("GENERAL");

  // Derive extra categories from specialties
  const specialtyCats = new Set(
    (vendor?.specialties ?? []).map((s) => PART_TO_VENDOR_CATEGORY[s]).filter(Boolean)
  );

  const relevantCats = new Set([...vendorCats, ...specialtyCats]);

  const visibleTiles = isGeneral
    ? TILES
    : TILES.filter((t) => relevantCats.has(t.vendorCategory));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, backgroundColor: C.offwhite }]}>
      <ReusableText text="What are you selling?" family="bold" size={26} color={C.secondary} />
      <View style={{ height: 20 }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {visibleTiles.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.catCard, { backgroundColor: C.white, borderColor: C.gray }]}
              onPress={() => {
                if (cat.label === "Tyres") { navigation.replace("AddEditTyreListing", {}); return; }
                if (cat.label === "Lamps") { navigation.replace("AddEditLightListing", {}); return; }
                if (cat.partCategory) { navigation.replace("AddEditPartListing", { category: cat.partCategory }); }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name={cat.icon} size={32} color={C.gray2} />
              <View style={{ height: 8 }} />
              <ReusableText text={cat.label} family="regular" size={13} color={C.secondary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 40,
  },
  catCard: {
    width: "46%",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    borderWidth: 1.5,
  },
});
