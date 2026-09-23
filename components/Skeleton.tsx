import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { SHADOWS, useThemeColors } from "../constants/theme";

type SkeletonBoxProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
};

export function SkeletonBox({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonBoxProps) {
  const C = useThemeColors();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width: width as number, height, borderRadius, backgroundColor: C.gray, opacity }, style]}
    />
  );
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  const C = useThemeColors();
  return <View style={[styles.card, { backgroundColor: C.white }]}>{children}</View>;
}

export function InboxItemSkeleton() {
  return (
    <SkeletonCard>
      <View style={styles.row}>
        <SkeletonBox width="55%" height={15} borderRadius={5} />
        <SkeletonBox width={56} height={22} borderRadius={10} />
      </View>
      <View style={{ height: 8 }} />
      <SkeletonBox width="40%" height={12} borderRadius={4} />
      <View style={{ height: 6 }} />
      <SkeletonBox width="30%" height={11} borderRadius={4} />
    </SkeletonCard>
  );
}

export function InboxSkeletonList() {
  return (
    <View style={styles.listPad}>
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          <InboxItemSkeleton />
          <View style={{ height: 10 }} />
        </React.Fragment>
      ))}
    </View>
  );
}

export function ProductItemSkeleton() {
  const C = useThemeColors();
  return (
    <View style={[styles.card, styles.productRow, { backgroundColor: C.white }]}>
      <SkeletonBox width={90} height={90} borderRadius={0} />
      <View style={styles.productInfo}>
        <SkeletonBox width="70%" height={14} borderRadius={5} />
        <View style={{ height: 6 }} />
        <SkeletonBox width="40%" height={16} borderRadius={5} />
        <View style={{ height: 8 }} />
        <View style={styles.row}>
          <SkeletonBox width={52} height={22} borderRadius={4} />
          <View style={{ width: 6 }} />
          <SkeletonBox width={72} height={22} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function ProductsSkeletonList() {
  return (
    <View style={styles.listPad}>
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          <ProductItemSkeleton />
          <View style={{ height: 12 }} />
        </React.Fragment>
      ))}
    </View>
  );
}

export function RequestDetailSkeleton() {
  return (
    <View style={[styles.listPad, { gap: 12 }]}>
      <SkeletonCard>
        <View style={styles.row}>
          <SkeletonBox width="55%" height={18} borderRadius={6} />
          <SkeletonBox width={64} height={24} borderRadius={10} />
        </View>
        <View style={{ height: 10 }} />
        <SkeletonBox width="45%" height={13} borderRadius={4} />
        <View style={{ height: 6 }} />
        <SkeletonBox width="35%" height={13} borderRadius={4} />
        <View style={{ height: 10 }} />
        <SkeletonBox width="80%" height={13} borderRadius={4} />
        <View style={{ height: 10 }} />
        <View style={styles.photoRow}>
          <SkeletonBox width={100} height={100} borderRadius={6} />
          <View style={{ width: 8 }} />
          <SkeletonBox width={100} height={100} borderRadius={6} />
        </View>
        <View style={{ height: 10 }} />
        <SkeletonBox width={110} height={11} borderRadius={4} />
      </SkeletonCard>

      <SkeletonCard>
        <SkeletonBox width="45%" height={16} borderRadius={5} />
        <View style={{ height: 12 }} />
        <SkeletonBox width="100%" height={44} borderRadius={8} />
        <View style={{ height: 10 }} />
        <SkeletonBox width="100%" height={44} borderRadius={8} />
        <View style={{ height: 10 }} />
        <SkeletonBox width="100%" height={44} borderRadius={8} />
      </SkeletonCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 14,
    ...SHADOWS.small,
  },
  productRow: { flexDirection: "row", padding: 0, overflow: "hidden" },
  productInfo: { flex: 1, padding: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoRow: { flexDirection: "row" },
  listPad: { padding: 12 },
});
