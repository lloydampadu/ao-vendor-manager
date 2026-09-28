import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import OTPScreen from '../screens/OTPScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import OnboardingBrandsScreen from '../screens/OnboardingBrandsScreen';
import TabNavigator from './TabNavigator';

export type RootStackParamList = {
  Login: undefined;
  OTP: { phone: string };
  Onboarding: undefined;
  OnboardingBrands: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type Props = {
  initialRoute?: keyof RootStackParamList;
};

export default function RootNavigator({ initialRoute = 'Login' }: Props): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName={initialRoute}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="OTP" component={OTPScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="OnboardingBrands" component={OnboardingBrandsScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="Main" component={TabNavigator} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
