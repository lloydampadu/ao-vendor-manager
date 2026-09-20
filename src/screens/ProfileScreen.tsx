import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../store/auth-store";
import { Card, ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function ProfileScreen(): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { vendor, clearAuth } = useAuthStore();

  function logout(): void {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await clearAuth();
            rootNav.reset({ index: 0, routes: [{ name: "Login" }] });
          })();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Card>
          <ReusableText text={vendor?.name ?? "Vendor"} family="bold" size={18} color={COLORS.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text={vendor?.phone ?? ""} family="regular" size={SIZES.medium} color={COLORS.gray2} />
          {vendor?.categories && vendor.categories.length > 0 && (
            <>
              <HeightSpacer height={4} />
              <ReusableText
                text={vendor.categories.join(", ")}
                family="regular"
                size={SIZES.small}
                color={COLORS.gray2}
              />
            </>
          )}
        </Card>

        <HeightSpacer height={16} />

        <ReusableBtn
          onPress={logout}
          btnText="Log out"
          backgroundColor={COLORS.white}
          textColor={COLORS.primary}
          width="100%"
          height={52}
          borderRadius={10}
          borderWidth={1.5}
          borderColor={COLORS.primary}
          fontSize={SIZES.medium}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offwhite },
  container: { flex: 1, padding: 16 },
});
