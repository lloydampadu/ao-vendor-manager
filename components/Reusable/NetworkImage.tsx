import { Image } from "expo-image";
import { DimensionValue } from "react-native";
import React from "react";

type Props = {
  source: string;
  width: number | string;
  height: number;
  radius?: number;
};

const NetworkImage = ({ source, width, height, radius = 0 }: Props) => {
  return (
    <Image
      source={source}
      style={{ width: width as DimensionValue, height, borderRadius: radius, backgroundColor: "#e5e7eb" }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
    />
  );
};

export default NetworkImage;
