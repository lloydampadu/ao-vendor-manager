import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProductsScreen, { type Product } from "../screens/ProductsScreen";
import AddEditProductScreen from "../screens/AddEditProductScreen";

export type ProductsStackParamList = {
  ProductsList: undefined;
  AddEditProduct: { product?: Product };
};

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export default function ProductsStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProductsList" component={ProductsScreen} options={{ title: "My Products" }} />
      <Stack.Screen
        name="AddEditProduct"
        component={AddEditProductScreen}
        options={({ route }) => ({ title: route.params?.product ? "Edit Product" : "Add Product" })}
      />
    </Stack.Navigator>
  );
}
