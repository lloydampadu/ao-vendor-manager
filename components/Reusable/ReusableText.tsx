import { Text } from "react-native";
import React from "react";

type Props = {
  text: string;
  family?: string;
  size?: number;
  color?: string;
  numberOfLines?: number;
};

const ReusableText = ({ text, family = "regular", size = 14, color = "#000000", numberOfLines }: Props) => {
  return (
    <Text style={{ fontFamily: family, fontSize: size, color }} numberOfLines={numberOfLines}>
      {text}
    </Text>
  );
};

export default ReusableText;
