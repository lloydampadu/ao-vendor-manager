import React from "react";
import { View } from "react-native";
import { useThemeColors } from "../../constants/theme";

// Placeholder — Task 8 will replace this body.
export default function OrderDetailScreen(): React.JSX.Element {
  const C = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: C.offwhite }} />;
}
