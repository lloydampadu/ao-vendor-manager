import React from "react";
import { View } from "react-native";
import ReusableText from "./Reusable/ReusableText";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING:  { bg: "#FFF3CD", text: "#856404" },
  QUOTED:   { bg: "#D1ECF1", text: "#0C5460" },
  DECLINED: { bg: "#F8D7DA", text: "#721C24" },
  EXPIRED:  { bg: "#E2E3E5", text: "#6C757D" },
  SELECTED: { bg: "#D4EDDA", text: "#155724" },
  REJECTED: { bg: "#E2E3E5", text: "#6C757D" },
};

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const c = STATUS_COLORS[status] ?? { bg: "#E2E3E5", text: "#333" };
  return (
    <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c.bg }}>
      <ReusableText text={status} family="medium" size={11} color={c.text} />
    </View>
  );
}
