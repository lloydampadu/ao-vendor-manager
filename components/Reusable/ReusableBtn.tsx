import { Text, TouchableOpacity, type DimensionValue } from "react-native";
import React from "react";
import { SIZES } from "../../constants/theme";

type Props = {
  onPress: () => void;
  btnText: string;
  textColor?: string;
  width?: number | string;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  fontSize?: number;
  height?: number;
  borderRadius?: number;
  disabled?: boolean;
};

const ReusableBtn = ({
  onPress,
  btnText,
  textColor = "#FFFFFF",
  width = "100%",
  backgroundColor = "#0060C0",
  borderWidth = 0,
  borderColor = "transparent",
  fontSize = SIZES.medium,
  height = 50,
  borderRadius = 12,
  disabled = false,
}: Props) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{
        width: width as DimensionValue,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        height,
        borderRadius,
        borderColor,
        borderWidth,
        flexShrink: 1,
      }}
    >
      <Text style={{ fontFamily: "medium", fontSize, color: textColor }} numberOfLines={1}>{btnText}</Text>
    </TouchableOpacity>
  );
};

export default ReusableBtn;
