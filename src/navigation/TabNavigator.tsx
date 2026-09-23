import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import InboxStackNavigator from './InboxStackNavigator';
import ProfileScreen from '../screens/ProfileScreen';
import ProductsStackNavigator from './ProductsStackNavigator';
import { useThemeColors } from '../../constants/theme';
import type { InboxStackParamList } from './InboxStackNavigator';
import type { ProductsStackParamList } from './ProductsStackNavigator';

export type TabParamList = {
  Inbox: NavigatorScreenParams<InboxStackParamList> | undefined;
  Products: NavigatorScreenParams<ProductsStackParamList> | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator(): React.JSX.Element {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : 8;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.secondary,
        tabBarInactiveTintColor: C.gray2,
        tabBarLabelStyle: {
          fontFamily: 'medium',
          fontSize: 11,
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: C.white,
          borderTopWidth: 1,
          borderTopColor: C.gray,
          paddingTop: 8,
          paddingBottom: bottomPad,
          height: 56 + bottomPad,
        },
      }}
    >
      <Tab.Screen
        name="Inbox"
        component={InboxStackNavigator}
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'mail' : 'mail-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsStackNavigator}
        options={{
          title: 'Products',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
