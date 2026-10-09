import React, { useEffect, useRef } from "react";
import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, type NavigationContainerRef, type Theme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/store/auth-store";
import { startSyncLoop } from "@/store/sync-store";
import { registerPushToken, resetPushRegistration, setupNotificationListeners, type NotificationTarget } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";
import RootNavigator, { type RootStackParamList } from "./src/navigation/RootNavigator";
import { ErrorBoundary, OfflineBanner } from "./components";
import { DARK_COLORS, LIGHT_COLORS } from "./constants/theme";

const log = createLogger("app");

// Keep the native splash up until fonts and the auth session are ready, so the
// vendor never sees a blank spinner between splash and first screen.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function navTheme(dark: boolean): Theme {
  const C = dark ? DARK_COLORS : LIGHT_COLORS;
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: { ...base.colors, primary: C.primary, background: C.offwhite, card: C.white, text: C.black, border: C.gray },
  };
}

export default function App(): React.JSX.Element {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const scheme = useColorScheme();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const pendingTarget = useRef<NotificationTarget | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    light: require("./assets/fonts/light.ttf"),
    regular: require("./assets/fonts/regular.ttf"),
    medium: require("./assets/fonts/medium.ttf"),
    bold: require("./assets/fonts/bold.ttf"),
    xtrabold: require("./assets/fonts/xtrabold.ttf"),
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const ready = (fontsLoaded || !!fontError) && status !== "loading";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
    if (fontError) log.warn("font load failed — falling back to system fonts", fontError);
  }, [ready, fontError]);

  // The sync loop and push registration live exactly as long as a session does.
  useEffect(() => {
    if (status !== "signedIn") {
      resetPushRegistration();
      return;
    }
    const stop = startSyncLoop();
    registerPushToken().catch((err) => log.warn("registerPushToken failed", err));
    return stop;
  }, [status]);

  // Notification taps: deep-link into the right nested screen. If the tap
  // arrives before navigation is mounted (cold start), hold it until ready.
  const openTarget = (target: NotificationTarget) => {
    const nav = navRef.current;
    if (!nav?.isReady() || useAuthStore.getState().status !== "signedIn") {
      pendingTarget.current = target;
      return;
    }
    if (target.kind === "order") {
      nav.navigate("Main", { screen: "Orders", params: { screen: "OrderDetail", params: { orderId: target.orderId } } });
    } else {
      nav.navigate("Main", { screen: "Inbox", params: { screen: "RequestDetail", params: { assignmentId: target.assignmentId } } });
    }
  };
  useEffect(() => setupNotificationListeners(openTarget), []); // eslint-disable-line react-hooks/exhaustive-deps

  const flushPendingTarget = () => {
    const t = pendingTarget.current;
    if (t && status === "signedIn") {
      pendingTarget.current = null;
      // Let the Main navigator mount before navigating into it.
      setTimeout(() => openTarget(t), 50);
    }
  };

  if (!ready) return <></>; // splash is still showing

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer ref={navRef} theme={navTheme(scheme === "dark")} onReady={flushPendingTarget} onStateChange={flushPendingTarget}>
          <OfflineBanner />
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
