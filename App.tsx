import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import NetInfo from '@react-native-community/netinfo';
import { getToken, loadVendor } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAuthStore, type Vendor } from '@/store/auth-store';
import { useSyncStore } from '@/store/sync-store';
import { setupNotificationListeners } from '@/lib/notifications';
import RootNavigator from './src/navigation/RootNavigator';
import { OfflineBanner } from './components';
import { COLORS } from './constants/theme';

type VendorMe = { vendor: { id: string; name: string; phone: string; categories: string[] } };

export default function App(): React.JSX.Element {
  const { vendor, setAuth, setVendor, clearAuth } = useAuthStore();
  const startSync = useSyncStore((s) => s.startSync);
  const [checking, setChecking] = useState(true);
  const navRef = useRef<NavigationContainerRef<ReactNavigation.RootParamList>>(null);

  const [fontsLoaded] = useFonts({
    light: require('./assets/fonts/light.otf'),
    regular: require('./assets/fonts/regular.otf'),
    medium: require('./assets/fonts/medium.otf'),
    bold: require('./assets/fonts/bold.otf'),
    xtrabold: require('./assets/fonts/xtrabold.otf'),
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // Load cached vendor so the app opens immediately even if offline
        const cachedRaw = await loadVendor();
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as Vendor;
          setVendor(cached);
        }

        // Refresh from server; only log out on explicit 401
        try {
          const { vendor: v } = await api.get<VendorMe>('/vendor-auth/me');
          await setAuth(token, v);
        } catch (err) {
          const e = err as { status?: number };
          if (e.status === 401) await clearAuth();
          // Network error — keep cached vendor, stay logged in
        }
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    let wasOnline: boolean | null = null;
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      if (wasOnline === false && online) {
        startSync().catch(() => {});
      }
      wasOnline = online;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const cleanup = setupNotificationListeners((assignmentId) => {
      const nav = navRef.current;
      if (nav?.isReady()) {
        nav.navigate('Main' as never);
        setTimeout(() => {
          (navRef.current?.navigate as (name: string, params: Record<string, string>) => void)?.(
            'RequestDetail',
            { requestId: assignmentId },
          );
        }, 100);
      }
    });
    return cleanup;
  }, []);

  if (!fontsLoaded || checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <OfflineBanner />
      <RootNavigator initialRoute={vendor ? 'Main' : 'Login'} />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
