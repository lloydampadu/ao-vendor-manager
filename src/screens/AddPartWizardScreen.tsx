import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReusableText, HeightSpacer } from "../../components";
import { useThemeColors } from "../../constants/theme";
import { useAuthStore } from "@/store/auth-store";
import { visibleTilesFor } from "@/lib/part-tiles";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type Props = NativeStackScreenProps<ProductsStackParamList, "AddPartWizard">;

export default function AddPartWizardScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const tiles = visibleTilesFor(vendor?.categories ?? [], vendor?.specialties ?? []);

  return (
    <ScrollView style={{ backgroundColor: C.offwhite }} contentContainerStyle={styles.root} showsVerticalScrollIndicator={false}>
      <ReusableText text="What are you selling?" family="bold" size={24} color={C.secondary} />
      <HeightSpacer height={6} />
      <ReusableText text="Pick a category to describe the part." family="regular" size={13} color={C.gray2} />
      <HeightSpacer height={20} />
      <View style={styles.grid}>
        {tiles.map((cat) => (
          <TouchableOpacity
            key={cat.label}
            style={[styles.tile, { backgroundColor: C.white, borderColor: C.gray }]}
            onPress={() => {
              if (cat.vendorCategory === "TYRES") navigation.replace("AddEditTyreListing", {});
              else if (cat.vendorCategory === "LAMPS") navigation.replace("AddEditLightListing", {});
              else if (cat.partCategory) navigation.replace("AddEditPartListing", { category: cat.partCategory });
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Add ${cat.label} part`}
          >
            <Ionicons name={cat.icon} size={32} color={C.primary} />
            <HeightSpacer height={8} />
            <ReusableText text={cat.label} family="medium" size={13} color={C.secondary} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingBottom: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47%", borderRadius: 14, padding: 20, alignItems: "center", borderWidth: 1.5 },
});
