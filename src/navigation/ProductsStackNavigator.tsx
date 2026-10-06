import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PartListingsScreen from "../screens/PartListingsScreen";
import AddPartWizardScreen from "../screens/AddPartWizardScreen";
import TyreListingsScreen from "../screens/TyreListingsScreen";
import AddEditTyreListingScreen from "../screens/AddEditTyreListingScreen";
import LightListingsScreen from "../screens/LightListingsScreen";
import AddEditLightListingScreen from "../screens/AddEditLightListingScreen";
import AddEditPartListingScreen from "../screens/AddEditPartListingScreen";
import type { TyreListing, LightListing } from "@/lib/db";
import type { ApiProduct } from "@/lib/api";
import { isTyreVendor, isLightVendor } from "@/lib/parts-catalog";
import { useAuthStore } from "@/store/auth-store";
import { useThemeColors } from "../../constants/theme";

export type ProductsStackParamList = {
  PartListings: undefined;
  AddPartWizard: undefined;
  TyreListings: undefined;
  AddEditTyreListing: { listing?: TyreListing } | undefined;
  LightListings: undefined;
  AddEditLightListing: { listing?: LightListing } | undefined;
  AddEditPartListing: { category: string; product?: ApiProduct };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export default function ProductsStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const initialRoute = isTyreVendor(vendor?.specialties, vendor?.categories)
    ? "TyreListings"
    : isLightVendor(vendor?.specialties, vendor?.categories)
    ? "LightListings"
    : "PartListings";
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTintColor: C.black,
        headerTitleStyle: { color: C.black, fontFamily: "bold" },
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="PartListings" component={PartListingsScreen} options={{ title: "My Parts" }} />
      <Stack.Screen name="AddPartWizard" component={AddPartWizardScreen} options={{ title: "Add a part", headerShown: true }} />
      <Stack.Screen name="TyreListings" component={TyreListingsScreen} options={{ title: "My Tyres" }} />
      <Stack.Screen
        name="AddEditTyreListing"
        component={AddEditTyreListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Tyre" : "Add Tyre" })}
      />
      <Stack.Screen name="LightListings" component={LightListingsScreen} options={{ title: "My Lights" }} />
      <Stack.Screen
        name="AddEditLightListing"
        component={AddEditLightListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Light" : "Add Light" })}
      />
      <Stack.Screen
        name="AddEditPartListing"
        component={AddEditPartListingScreen}
        options={({ route }) => ({ title: route.params.product ? "Edit Part" : `Add ${route.params.category} Part` })}
      />
    </Stack.Navigator>
  );
}
