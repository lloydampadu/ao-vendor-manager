import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ReusableText from "./Reusable/ReusableText";
import { useSyncStore } from "@/store/sync-store";

/**
 * Thin strip under the header area. Driven by the sync store's connectivity
 * flag (single NetInfo subscription in the sync loop) and the count of writes
 * waiting to reach the server, so the vendor knows their quote is safe.
 */
export function OfflineBanner(): React.JSX.Element | null {
  const isOnline = useSyncStore((s) => s.isOnline);
  const pending = useSyncStore((s) => s.pendingWrites);
  const insets = useSafeAreaInsets();

  if (isOnline && pending === 0) return null;

  const offline = !isOnline;
  const text = offline
    ? pending > 0
      ? `No internet — ${pending} change${pending === 1 ? "" : "s"} will send when you're back online`
      : "No internet connection"
    : `Sending ${pending} change${pending === 1 ? "" : "s"}…`;

  return (
    <View style={[styles.banner, { backgroundColor: offline ? "#333" : "#0060C0", paddingTop: insets.top + 6 }]} accessibilityLiveRegion="polite">
      <Ionicons name={offline ? "cloud-offline-outline" : "cloud-upload-outline"} size={14} color="#fff" />
      <ReusableText text={text} family="medium" size={12} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", gap: 6, paddingVertical: 6, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
});
