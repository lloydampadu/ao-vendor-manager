import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrdersScreen from "../screens/OrdersScreen";
import OrderDetailScreen from "../screens/OrderDetailScreen";
import { useThemeColors } from "../../constants/theme";

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderDetail: { orderId: string };
};

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export default function OrdersStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTintColor: C.black,
        headerTitleStyle: { color: C.black, fontFamily: "bold" },
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="OrdersList" component={OrdersScreen} options={{ title: "Orders" }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Order" }} />
    </Stack.Navigator>
  );
}
