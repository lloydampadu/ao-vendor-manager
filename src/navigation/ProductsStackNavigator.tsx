import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProductsScreen from "../screens/ProductsScreen";
import AddProductScreen from "../screens/AddProductScreen";
import AddEditTyreListingScreen from "../screens/AddEditTyreListingScreen";
import AddEditLightListingScreen from "../screens/AddEditLightListingScreen";
import AddEditFluidListingScreen from "../screens/AddEditFluidListingScreen";
import AddEditBatteryListingScreen from "../screens/AddEditBatteryListingScreen";
import AddEditPartListingScreen from "../screens/AddEditPartListingScreen";
import type { TyreListing, LightListing, FluidListing, BatteryListing } from "@/lib/db";
import type { ApiProduct } from "@/lib/api";
import { useThemeColors } from "../../constants/theme";

export type ProductsStackParamList = {
  ProductsList: undefined;
  AddProduct: undefined;
  AddEditTyreListing: { listing?: TyreListing } | undefined;
  AddEditLightListing: { listing?: LightListing } | undefined;
  AddEditFluidListing: { listing?: FluidListing } | undefined;
  AddEditBatteryListing: { listing?: BatteryListing } | undefined;
  AddEditPartListing: { category: string; product?: ApiProduct };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

/** One Products list for every vendor; "Add a product" opens the form for what they're adding. */
export default function ProductsStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  return (
    <Stack.Navigator
      initialRouteName="ProductsList"
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTintColor: C.black,
        headerTitleStyle: { color: C.black, fontFamily: "bold" },
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="ProductsList" component={ProductsScreen} options={{ title: "My Products" }} />
      <Stack.Screen name="AddProduct" component={AddProductScreen} options={{ title: "Add a product", headerShown: true }} />
      <Stack.Screen
        name="AddEditTyreListing"
        component={AddEditTyreListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Tyre" : "Add Tyre" })}
      />
      <Stack.Screen
        name="AddEditLightListing"
        component={AddEditLightListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit Lamp" : "Add Lamp" })}
      />
      <Stack.Screen
        name="AddEditFluidListing"
        component={AddEditFluidListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit oil or fluid" : "Add oil or fluid" })}
      />
      <Stack.Screen
        name="AddEditBatteryListing"
        component={AddEditBatteryListingScreen}
        options={({ route }) => ({ title: route.params?.listing ? "Edit battery" : "Add battery" })}
      />
      <Stack.Screen
        name="AddEditPartListing"
        component={AddEditPartListingScreen}
        options={({ route }) => ({ title: route.params.product ? "Edit Part" : `Add ${route.params.category} Part` })}
      />
    </Stack.Navigator>
  );
}
