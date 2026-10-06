import React, { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { isApiError, vendorAuthApi } from "@/lib/api";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164 } from "@/constants/support";
import { normaliseGhanaPhone } from "@/lib/phone";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function send(): Promise<void> {
    const normalised = normaliseGhanaPhone(phone);
    if (!normalised) {
      setError("Enter a valid Ghana number (e.g. 024 412 3456)");
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await vendorAuthApi.sendOtp(normalised);
      navigation.navigate("OTP", { phone: normalised });
    } catch (e) {
      if (isApiError(e) && e.status === 404) {
        setError(`This number isn't registered as a vendor. Call us on ${SUPPORT_PHONE_DISPLAY} to get set up.`);
      } else if (isApiError(e) && e.isNetworkError) {
        setError("No connection. Check your internet and try again.");
      } else {
        setError("Could not send the code. Please try again in a moment.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.white }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ReusableText text="AO Direct" family="xtrabold" size={SIZES.large} color={C.primary} />
        <HeightSpacer height={8} />
        <ReusableText text="Vendor sign-in" family="bold" size={32} color={C.secondary} />
        <HeightSpacer height={8} />
        <ReusableText
          text="Enter the phone number registered with AbosseyOkai Direct."
          family="regular"
          size={SIZES.small}
          color={C.gray2}
        />
        <HeightSpacer height={24} />

        <ReusableText text="Phone number" family="medium" size={SIZES.small} color={C.secondary} />
        <HeightSpacer height={6} />
        <TextInput
          style={[styles.input, { borderColor: error ? C.red : C.gray, color: C.secondary, backgroundColor: C.offwhite }]}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="024 412 3456"
          placeholderTextColor={C.gray2}
          value={phone}
          onChangeText={(t) => { setPhone(t); setError(undefined); }}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          editable={!loading}
          accessibilityLabel="Phone number"
        />
        {error ? (
          <>
            <HeightSpacer height={6} />
            <ReusableText text={error} family="regular" size={SIZES.xSmall} color={C.red} />
          </>
        ) : null}

        <HeightSpacer height={24} />
        <ReusableBtn
          onPress={() => void send()}
          btnText={loading ? "Sending…" : "Send code"}
          backgroundColor={loading ? C.gray2 : C.primary}
          textColor={C.white}
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
          disabled={loading}
        />

        <HeightSpacer height={32} />
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE_E164}`).catch(() => {})} style={styles.help}>
          <ReusableText text={`Need help? Call ${SUPPORT_PHONE_DISPLAY}`} family="regular" size={SIZES.small} color={C.gray2} />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  input: { height: 52, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, fontFamily: "regular", fontSize: SIZES.medium },
  help: { alignSelf: "center", padding: 8 },
});
