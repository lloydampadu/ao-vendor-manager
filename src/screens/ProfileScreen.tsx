import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";
import { errorMessage, vendorAuthApi } from "@/lib/api";
import { uploadImage } from "@/lib/upload";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164 } from "@/constants/support";
import { Card, ReusableBtn, ReusableText, HeightSpacer, NetworkImage } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import Constants from "expo-constants";

export default function ProfileScreen(): React.JSX.Element {
  const C = useThemeColors();
  const vendor = useAuthStore((s) => s.vendor);
  const setVendor = useAuthStore((s) => s.setVendor);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const pendingWrites = useSyncStore((s) => s.pendingWrites);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { void refreshProfile(); }, [refreshProfile]);

  async function changePhoto(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(result.assets[0].uri);
      await vendorAuthApi.setImage(imageUrl);
      if (vendor) setVendor({ ...vendor, imageUrl });
    } catch (e) {
      Alert.alert("Upload failed", errorMessage(e, "Could not update your photo. Try again."));
    } finally {
      setUploading(false);
    }
  }

  const initials = (vendor?.name || "V").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "V";

  function logout(): void {
    const warning = pendingWrites > 0
      ? `You have ${pendingWrites} change${pendingWrites === 1 ? "" : "s"} that haven't reached the server yet. Logging out now will discard them.`
      : "You'll need to sign in again with your phone number.";
    Alert.alert("Log out?", warning, [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  const specialtiesLabel = vendor?.specialties.length
    ? vendor.specialties.length > 3 ? `${vendor.specialties.slice(0, 3).join(", ")} +${vendor.specialties.length - 3} more` : vendor.specialties.join(", ")
    : null;
  const realBrands = (vendor?.brands ?? []).filter((b) => b.toLowerCase() !== "all");
  const brandsLabel = realBrands.length === 0 ? "All brands" : realBrands.join(", ");
  const version = Constants.expoConfig?.version ?? "";

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.safe, { backgroundColor: C.offwhite }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <View style={styles.avatarWrap}>
            {vendor?.imageUrl ? (
              <NetworkImage source={vendor.imageUrl} width={96} height={96} radius={48} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.offwhite, borderColor: C.gray }]}>
                <ReusableText text={initials} family="bold" size={28} color={C.gray2} />
              </View>
            )}
            <TouchableOpacity onPress={() => void changePhoto()} disabled={uploading} style={[styles.changePhoto, { borderColor: C.primary }]} accessibilityRole="button">
              {uploading ? <ActivityIndicator size="small" color={C.primary} /> : (
                <ReusableText text={vendor?.imageUrl ? "Change photo" : "Add photo"} family="medium" size={SIZES.small} color={C.primary} />
              )}
            </TouchableOpacity>
          </View>
          <HeightSpacer height={12} />
          <ReusableText text={vendor?.name || "Vendor"} family="bold" size={18} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text={vendor?.phone ?? ""} family="regular" size={SIZES.medium} color={C.gray2} />
          {vendor?.tier ? (<><HeightSpacer height={6} /><ReusableText text={`Tier: ${vendor.tier}${vendor.fulfilledCount != null ? ` · ${vendor.fulfilledCount} orders fulfilled` : ""}`} family="medium" size={SIZES.small} color={C.primary} /></>) : null}
        </Card>

        <HeightSpacer height={12} />
        <Card>
          <ReusableText text="What you sell" family="bold" size={SIZES.small} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text={specialtiesLabel ?? "Not set"} family="regular" size={SIZES.small} color={C.gray2} />
          <HeightSpacer height={10} />
          <ReusableText text="Brands" family="bold" size={SIZES.small} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text={brandsLabel ?? "Not set"} family="regular" size={SIZES.small} color={C.gray2} />
          <HeightSpacer height={6} />
          <ReusableText text={`To change these, call us on ${SUPPORT_PHONE_DISPLAY}.`} family="regular" size={11} color={C.gray2} />
        </Card>

        <HeightSpacer height={12} />
        <TouchableOpacity
          style={[styles.supportRow, { backgroundColor: C.white, borderColor: C.gray }]}
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE_E164}`).catch(() => Alert.alert("Couldn't open the dialer", `Call us on ${SUPPORT_PHONE_DISPLAY}`))}
          activeOpacity={0.7}
          accessibilityRole="link"
        >
          <Ionicons name="call-outline" size={18} color={C.primary} />
          <View style={{ marginLeft: 10 }}>
            <ReusableText text="Need help? Call us" family="medium" size={SIZES.small} color={C.secondary} />
            <ReusableText text={SUPPORT_PHONE_DISPLAY} family="regular" size={SIZES.small} color={C.primary} />
          </View>
        </TouchableOpacity>

        <HeightSpacer height={12} />
        <ReusableBtn onPress={logout} btnText="Log out" backgroundColor={C.white} textColor={C.primary} height={52} borderRadius={10} borderWidth={1.5} borderColor={C.primary} fontSize={SIZES.medium} />

        <HeightSpacer height={16} />
        <ReusableText
          text={`${version ? `v${version} · ` : ""}${lastSyncAt ? `Last synced ${lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not synced yet"}${pendingWrites > 0 ? ` · ${pendingWrites} pending` : ""}`}
          family="regular"
          size={11}
          color={C.gray2}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 32 },
  avatarWrap: { alignItems: "center", gap: 10 },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  changePhoto: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  supportRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, borderWidth: 1 },
});
