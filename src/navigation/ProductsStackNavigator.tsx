import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProductsScreen, { type Product } from "../screens/ProductsScreen";
import AddEditProductScreen from "../screens/AddEditProductScreen";
import AddPartWizardScreen from "../screens/AddPartWizardScreen";
import { useThemeColors } from "../../constants/theme";

export type ProductsStackParamList = {
  ProductsList: undefined;
  AddEditProduct: { product?: Product };
  AddPartWizard: undefined;
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export default function ProductsStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  return (
    <Stack.Navigator
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
    </Stack.Navigator>
  );
}
