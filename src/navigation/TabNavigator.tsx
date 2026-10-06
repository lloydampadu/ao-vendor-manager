import React, { useCallback } from "react";
import { Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import InboxStackNavigator, { type InboxStackParamList } from "./InboxStackNavigator";
import ProfileScreen from "../screens/ProfileScreen";
import ProductsStackNavigator, { type ProductsStackParamList } from "./ProductsStackNavigator";
import OrdersStackNavigator, { type OrdersStackParamList } from "./OrdersStackNavigator";
import { useThemeColors } from "../../constants/theme";
import { countOrdersByStage, getAssignments } from "@/lib/db";
import { useSyncedQuery } from "@/hooks/useSyncedQuery";

export type TabParamList = {
  Inbox: NavigatorScreenParams<InboxStackParamList> | undefined;
  Orders: NavigatorScreenParams<OrdersStackParamList> | undefined;
  Products: NavigatorScreenParams<ProductsStackParamList> | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

type Badges = { newRequests: number; toPrepare: number };

export default function TabNavigator(): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "android" ? Math.max(insets.bottom, 8) : 8;

  // Badge counts come from SQLite and refresh on every sync tick — no timers here.
  const loadBadges = useCallback(async (): Promise<Badges> => {
    const [pending, toPrepare] = await Promise.all([getAssignments(["PENDING"]), countOrdersByStage("TO_BRING")]);
    return { newRequests: pending.length, toPrepare };
  }, []);
  const { data: badges } = useSyncedQuery<Badges>(loadBadges, { newRequests: 0, toPrepare: 0 });

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.secondary,
        tabBarInactiveTintColor: C.gray2,
        tabBarLabelStyle: { fontFamily: "medium", fontSize: 11, marginBottom: 2 },
        tabBarStyle: {
          backgroundColor: C.white,
          borderTopWidth: 1,
          borderTopColor: C.gray,
          paddingTop: 8,
          paddingBottom: bottomPad,
          height: 56 + bottomPad,
        },
        tabBarBadgeStyle: { fontFamily: "medium", fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="Inbox"
        component={InboxStackNavigator}
        options={{
          title: "Inbox",
          tabBarBadge: badges.newRequests > 0 ? badges.newRequests : undefined,
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? "mail" : "mail-outline"} size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStackNavigator}
        options={{
          title: "Orders",
          tabBarBadge: badges.toPrepare > 0 ? badges.toPrepare : undefined,
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? "receipt" : "receipt-outline"} size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsStackNavigator}
        options={{
          title: "Products",
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={24} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profile",
          headerShown: true,
          headerStyle: { backgroundColor: C.white },
          headerTintColor: C.black,
          headerTitleStyle: { color: C.black, fontFamily: "bold" },
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
