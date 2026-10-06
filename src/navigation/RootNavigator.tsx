import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import LoginScreen from "../screens/LoginScreen";
import OTPScreen from "../screens/OTPScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import OnboardingBrandsScreen from "../screens/OnboardingBrandsScreen";
import ProfileGateScreen from "../screens/ProfileGateScreen";
import TabNavigator, { type TabParamList } from "./TabNavigator";
import { useAuthStore } from "@/store/auth-store";

export type RootStackParamList = {
  Login: undefined;
  OTP: { phone: string };
  ProfileGate: undefined;
  Onboarding: undefined;
  OnboardingBrands: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
};

declare global {
  // Lets `navigationRef.navigate("Main", {...})` type-check from App.tsx.
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Auth is declarative: the set of mounted screens is derived from the auth
 * store, so signing in, finishing onboarding, logging out and a 401 all move
 * the vendor to the right place without any screen calling `reset()`.
 */
export default function RootNavigator(): React.JSX.Element {
  const status = useAuthStore((s) => s.status);
  const vendor = useAuthStore((s) => s.vendor);

  const signedIn = status === "signedIn";
  const needsSpecialties = signedIn && !!vendor && vendor.specialties.length === 0;
  const needsBrands = signedIn && !!vendor && !needsSpecialties && vendor.brands.length === 0;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!signedIn ? (
        <Stack.Group>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="OTP" component={OTPScreen} />
        </Stack.Group>
      ) : !vendor ? (
        <Stack.Screen name="ProfileGate" component={ProfileGateScreen} />
      ) : needsSpecialties ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ gestureEnabled: false }} />
      ) : needsBrands ? (
        <Stack.Screen name="OnboardingBrands" component={OnboardingBrandsScreen} options={{ gestureEnabled: false }} />
      ) : (
        <Stack.Screen name="Main" component={TabNavigator} />
      )}
    </Stack.Navigator>
  );
}
