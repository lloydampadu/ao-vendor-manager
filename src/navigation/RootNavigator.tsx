import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import OTPScreen from '../screens/OTPScreen';
import TabNavigator from './TabNavigator';

export type RootStackParamList = {
  Login: undefined;
  OTP: { phone: string };
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type Props = {
  initialRoute?: keyof RootStackParamList;
};

export default function RootNavigator({ initialRoute = 'Login' }: Props): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName={initialRoute}>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OTP"
        component={OTPScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
