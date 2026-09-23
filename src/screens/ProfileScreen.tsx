import React, { useEffect } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../store/auth-store";
import { api } from "@/lib/api";
import { Card, ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type VendorMe = { vendor: { id: string; name: string; phone: string; categories: string[]; specialties: string[]; brands: string[] } };

export default function ProfileScreen(): React.JSX.Element {
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { vendor, setVendor, clearAuth } = useAuthStore();

  useEffect(() => {
    api.get<VendorMe>("/vendor-auth/me")
      .then(({ vendor: v }) => setVendor({ ...v, specialties: v.specialties ?? [], brands: v.brands ?? [] }))
      .catch(() => {});
  }, []);

  function logout(): void {
    Alert.alert("Log out", "Are you sure you want to log out?", [
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
          {vendor?.specialties && vendor.specialties.length > 0 && (
            <>
              <HeightSpacer height={10} />
              <ReusableText text="Parts I sell" family="medium" size={SIZES.small} color={COLORS.secondary} />
              <HeightSpacer height={6} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}>
                {vendor.specialties.map((part) => (
                  <View key={part} style={styles.chip}>
                    <ReusableText text={part} family="regular" size={11} color={COLORS.primary} />
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </Card>

        <HeightSpacer height={12} />

        <TouchableOpacity
          style={styles.editSpecialties}
          onPress={() => rootNav.navigate("Onboarding")}
        >
          <ReusableText text="Change what I sell" family="medium" size={SIZES.small} color={COLORS.primary} />
        </TouchableOpacity>

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
  editSpecialties: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#EBF4FF",
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "#EBF4FF",
    marginRight: 6,
    marginVertical: 2,
  },
});
