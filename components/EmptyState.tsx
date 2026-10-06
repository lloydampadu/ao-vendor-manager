import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import HeightSpacer from "./Reusable/HeightSpacer";
import { SIZES, useThemeColors } from "../constants/theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
};

export function EmptyState({ icon, title, subtitle }: Props): React.JSX.Element {
  const C = useThemeColors();
  return (
    <View style={styles.root}>
      <Ionicons name={icon} size={48} color={C.gray} />
      <HeightSpacer height={12} />
      <ReusableText text={title} family="medium" size={SIZES.medium} color={C.secondary} />
      {subtitle ? (
        <>
          <HeightSpacer height={6} />
          <ReusableText text={subtitle} family="regular" size={SIZES.small} color={C.gray2} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 32 },
});
