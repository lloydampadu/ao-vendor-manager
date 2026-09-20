import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import { COLORS } from "../constants/theme";
import type { QuoteSyncStatus } from "../lib/db";

type Props = { status: QuoteSyncStatus };

const CONFIG = {
  pending: { icon: "time-outline" as const,       color: COLORS.gray2,   label: "Sending…"     },
  synced:  { icon: "checkmark-done" as const,     color: "#22c55e",      label: "Sent"         },
  error:   { icon: "alert-circle-outline" as const, color: "#ef4444",    label: "Failed to send" },
};

export function SyncStatusIcon({ status }: Props) {
  const { icon, color, label } = CONFIG[status];
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={color} />
      <ReusableText text={label} family="regular" size={11} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
});
