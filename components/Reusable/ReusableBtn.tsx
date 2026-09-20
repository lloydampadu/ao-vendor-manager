import { StyleSheet, Text, TouchableOpacity, DimensionValue } from "react-native";
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
}: Props) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: width as DimensionValue,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        height,
        borderRadius,
        borderColor,
        borderWidth,
      }}
    >
      <Text style={{ fontFamily: "medium", fontSize, color: textColor }}>{btnText}</Text>
    </TouchableOpacity>
  );
};

export default ReusableBtn;

const styles = StyleSheet.create({});
