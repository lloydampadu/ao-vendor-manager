import React from "react";
import { TouchableOpacity, View } from "react-native";
import { SHADOWS, COLORS } from "../constants/theme";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  activeOpacity?: number;
  padding?: number;
  borderRadius?: number;
  style?: object;
};

export default function Card({
  children,
  onPress,
  activeOpacity = 0.7,
  padding = 14,
  borderRadius = 10,
  style,
}: Props) {
  const base = {
    backgroundColor: COLORS.white,
    borderRadius,
    padding,
    ...SHADOWS.small,
    ...style,
  };

  if (onPress) {
    return (
      <TouchableOpacity style={base} onPress={onPress} activeOpacity={activeOpacity}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={base}>{children}</View>;
}
