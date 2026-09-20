import React, { useEffect, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { ReusableText } from "./index";
import { COLORS } from "../constants/theme";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-40)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      Animated.timing(slideAnim, {
        toValue: offline ? 0 : -40,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
    return unsub;
  }, []);

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <ReusableText text="No internet connection" family="medium" size={13} color={COLORS.white} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#333",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
