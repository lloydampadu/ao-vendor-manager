import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";

/**
 * Shown only when a valid token exists but the profile could not be loaded
 * (first launch while offline). Retries automatically when connectivity
 * returns and offers a manual retry / sign-out.
 */
export default function ProfileGateScreen(): React.JSX.Element {
  const C = useThemeColors();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const isOnline = useSyncStore((s) => s.isOnline);
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try { await refreshProfile(); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (isOnline) void retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.white }]}>
      <View style={styles.container}>
        {busy ? <ActivityIndicator size="large" color={C.primary} /> : null}
        <HeightSpacer height={16} />
        <ReusableText text="Connecting…" family="bold" size={22} color={C.secondary} />
        <HeightSpacer height={8} />
        <ReusableText
          text="We need an internet connection once to load your vendor profile."
          family="regular"
          size={SIZES.small}
          color={C.gray2}
        />
        <HeightSpacer height={24} />
        <ReusableBtn onPress={() => void retry()} btnText="Try again" backgroundColor={C.primary} textColor={C.white} height={48} />
        <HeightSpacer height={12} />
        <ReusableBtn onPress={() => void signOut()} btnText="Sign out" backgroundColor="transparent" textColor={C.gray2} height={44} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" },
});
