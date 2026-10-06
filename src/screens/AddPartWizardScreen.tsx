import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReusableText } from "../../components";
import { useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ProductsStackParamList, "AddPartWizard">;
};

type Category = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: string | null;
};

const CATEGORIES: Category[] = [
  { label: "Body",         icon: "car-outline",              category: "Body" },
  { label: "Engine",       icon: "settings-outline",         category: "Engine" },
  { label: "Brakes",       icon: "disc-outline",             category: "Axle & Brakes" },
  { label: "Electrical",   icon: "flash-outline",            category: "Electrical" },
  { label: "Tyres",        icon: "ellipse-outline",          category: null },
  { label: "Lamps",        icon: "bulb-outline",             category: null },
  { label: "Suspension",   icon: "git-branch-outline",       category: "Steering & Suspension" },
  { label: "Transmission", icon: "swap-horizontal-outline",  category: "Transmission" },
  { label: "Interior",     icon: "grid-outline",             category: "Interior" },
  { label: "Glass",        icon: "tablet-landscape-outline", category: "Glass" },
  { label: "Cooling",      icon: "thermometer-outline",      category: "Heating & Cooling" },
  { label: "Air & Fuel",   icon: "flame-outline",            category: "Air & Fuel" },
];

export default function AddPartWizardScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, backgroundColor: C.offwhite }]}>
      <ReusableText text="What are you selling?" family="bold" size={26} color={C.secondary} />
      <View style={{ height: 20 }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.catCard, { backgroundColor: C.white, borderColor: C.gray }]}
              onPress={() => {
                if (cat.label === "Tyres") { navigation.replace("AddEditTyreListing", {}); return; }
                if (cat.label === "Lamps") { navigation.replace("AddEditLightListing", {}); return; }
                if (cat.category) { navigation.replace("AddEditPartListing", { category: cat.category }); }
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
