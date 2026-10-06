import React from "react";
import { View } from "react-native";
import ReusableText from "./Reusable/ReusableText";
import { STATUS_LABEL, type EffectiveStatus } from "@/lib/assignment-status";

const STATUS_COLORS: Record<EffectiveStatus, { bg: string; text: string }> = {
  PENDING:  { bg: "#FFF3CD", text: "#856404" },
  QUOTED:   { bg: "#D1ECF1", text: "#0C5460" },
  WON:      { bg: "#D4EDDA", text: "#155724" },
  LOST:     { bg: "#E2E3E5", text: "#6C757D" },
  DECLINED: { bg: "#F8D7DA", text: "#721C24" },
  EXPIRED:  { bg: "#E2E3E5", text: "#6C757D" },
};

export function StatusBadge({ status }: { status: EffectiveStatus }): React.JSX.Element {
  const c = STATUS_COLORS[status];
  return (
    <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c.bg }}>
      <ReusableText text={STATUS_LABEL[status]} family="medium" size={11} color={c.text} />
    </View>
  );
}
