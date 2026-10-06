import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../store/auth-store";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/upload";
import { Card, ReusableBtn, ReusableText, HeightSpacer, NetworkImage } from "../../components";
import { Ionicons } from "@expo/vector-icons";

const SUPPORT_PHONE = "+233506221697";
const SUPPORT_DISPLAY = "050 622 1697";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type VendorMe = { vendor: { id: string; name: string; phone: string; categories: string[]; specialties: string[]; brands: string[]; imageUrl?: string | null } };

export default function ProfileScreen(): React.JSX.Element {
  const C = useThemeColors();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { vendor, setVendor, clearAuth } = useAuthStore();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get<VendorMe>("/vendor-auth/me")
      .then(({ vendor: v }) => setVendor({ ...v, specialties: v.specialties ?? [], brands: v.brands ?? [] }))
      .catch(() => {});
  }, []);

  async function changePhoto(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(result.assets[0].uri);
      await api.patch("/vendor-auth/image", { imageUrl });
      if (vendor) setVendor({ ...vendor, imageUrl });
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not update your photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const initials = (vendor?.name ?? "V").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "V";

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
    <SafeAreaView edges={["bottom"]} style={[styles.safe, { backgroundColor: C.offwhite }]}>
      <View style={styles.container}>
        <Card>
          <View style={styles.avatarWrap}>
            {vendor?.imageUrl ? (
              <NetworkImage source={vendor.imageUrl} width={96} height={96} radius={48} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.offwhite, borderColor: C.gray }]}>
                <ReusableText text={initials} family="bold" size={28} color={C.gray2} />
              </View>
            )}
            <TouchableOpacity onPress={() => void changePhoto()} disabled={uploading} style={[styles.changePhoto, { borderColor: C.primary }]}>
              {uploading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <ReusableText text={vendor?.imageUrl ? "Change photo" : "Add photo"} family="medium" size={SIZES.small} color={C.primary} />
              )}
            </TouchableOpacity>
          </View>
          <HeightSpacer height={12} />
          <ReusableText text={vendor?.name ?? "Vendor"} family="bold" size={18} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text={vendor?.phone ?? ""} family="regular" size={SIZES.medium} color={C.gray2} />
          {vendor?.categories && vendor.categories.length > 0 && (
            <>
              <HeightSpacer height={4} />
              <ReusableText
                text={vendor.categories.join(", ")}
                family="regular"
                size={SIZES.small}
                color={C.gray2}
              />
            </>
          )}
        </Card>

        <HeightSpacer height={16} />

        <TouchableOpacity
          style={[styles.supportRow, { backgroundColor: C.white, borderColor: C.gray }]}
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => Alert.alert("Couldn't open dialer", `Call us on ${SUPPORT_DISPLAY}`))}
          activeOpacity={0.7}
        >
          <Ionicons name="call-outline" size={18} color={C.primary} />
          <View style={{ marginLeft: 10 }}>
            <ReusableText text="Need help? Call us" family="medium" size={SIZES.small} color={C.secondary} />
            <ReusableText text={SUPPORT_DISPLAY} family="regular" size={SIZES.small} color={C.primary} />
          </View>
        </TouchableOpacity>

        <HeightSpacer height={12} />

        <ReusableBtn
          onPress={logout}
          btnText="Log out"
          backgroundColor={C.white}
          textColor={C.primary}
          width="100%"
          height={52}
          borderRadius={10}
          borderWidth={1.5}
          borderColor={C.primary}
          fontSize={SIZES.medium}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 16 },
  avatarWrap: { alignItems: "center", gap: 10 },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  changePhoto: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  supportRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, borderWidth: 1 },
});
