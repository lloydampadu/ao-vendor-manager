import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProductsScreen, { type Product } from "../screens/ProductsScreen";
import AddEditProductScreen from "../screens/AddEditProductScreen";
import AddPartWizardScreen from "../screens/AddPartWizardScreen";
import TyreListingsScreen from "../screens/TyreListingsScreen";
import AddEditTyreListingScreen from "../screens/AddEditTyreListingScreen";
import LightListingsScreen from "../screens/LightListingsScreen";
import AddEditLightListingScreen from "../screens/AddEditLightListingScreen";
import AddEditPartListingScreen from "../screens/AddEditPartListingScreen";
import type { TyreListing, LightListing } from "@/lib/db";
import { isTyreVendor, isLightVendor } from "@/lib/parts-catalog";
import { useAuthStore } from "@/store/auth-store";
import { useThemeColors } from "../../constants/theme";

export type ProductsStackParamList = {
  ProductsList: undefined;
  AddEditProduct: { product?: Product };
  AddPartWizard: undefined;
  TyreListings: undefined;
  AddEditTyreListing: { listing?: TyreListing };
  LightListings: undefined;
  AddEditLightListing: { listing?: LightListing };
  AddEditPartListing: { category: string };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export default function ProductsStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const initialRoute = isTyreVendor(vendor?.specialties, vendor?.categories)
    ? "TyreListings"
    : isLightVendor(vendor?.specialties, vendor?.categories)
    ? "LightListings"
    : "ProductsList";
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTintColor: C.black,
        headerTitleStyle: { color: C.black },
      }}
    >
      <Stack.Screen
        name="ProductsList"
        component={ProductsScreen}
        options={{ title: "My Parts" }}
      />
      <Stack.Screen
        name="AddPartWizard"
        component={AddPartWizardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddEditProduct"
        component={AddEditProductScreen}
        options={({ route }) => ({ title: route.params?.product ? "Edit Part" : "Add Part" })}
      />
      <Stack.Screen
        name="TyreListings"
        component={TyreListingsScreen}
        options={{ title: "My Tyres" }}
      />
      <Stack.Screen
        name="AddEditTyreListing"
        component={AddEditTyreListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Tyre" : "Add Tyre" })}
      />
      <Stack.Screen
        name="LightListings"
        component={LightListingsScreen}
        options={{ title: "My Lights" }}
      />
      <Stack.Screen
        name="AddEditLightListing"
        component={AddEditLightListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Light" : "Add Light" })}
      />
      <Stack.Screen
        name="AddEditPartListing"
        component={AddEditPartListingScreen}
        options={({ route }) => ({ title: `Add ${route.params.category} Part` })}
      />
    </Stack.Navigator>
  );
}
