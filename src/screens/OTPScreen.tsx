import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { isApiError, vendorAuthApi } from "@/lib/api";
import { toVendor, useAuthStore } from "@/store/auth-store";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "OTP">;

const RESEND_COOLDOWN_S = 30;

export default function OTPScreen({ route, navigation }: Props): React.JSX.Element {
  const C = useThemeColors();
  const { phone } = route.params;
  const signIn = useAuthStore((s) => s.signIn);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(submitted = code): Promise<void> {
    if (submitted.length !== 6) { setError("Enter the 6-digit code"); return; }
    setError(undefined);
    setLoading(true);
    try {
      const { token, vendor } = await vendorAuthApi.verifyOtp(phone, submitted);
      // The root navigator switches to onboarding / main from the store.
      await signIn(token, toVendor(vendor));
    } catch (e) {
      if (isApiError(e) && e.isNetworkError) setError("No connection. Check your internet and try again.");
      else setError("Wrong code or it has expired. Please try again.");
      setLoading(false);
    }
  }

  async function resend(): Promise<void> {
    setResending(true);
    setError(undefined);
    try {
      await vendorAuthApi.sendOtp(phone);
      setCooldown(RESEND_COOLDOWN_S);
      setCode("");
    } catch {
      setError("Couldn't resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.white }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ReusableText text="Enter code" family="bold" size={32} color={C.secondary} />
        <HeightSpacer height={8} />
        <ReusableText text={`We sent a 6-digit code by SMS to ${phone}.`} family="regular" size={SIZES.small} color={C.gray2} />
        <HeightSpacer height={24} />

        <ReusableText text="Code" family="medium" size={SIZES.small} color={C.secondary} />
        <HeightSpacer height={6} />
        <TextInput
          style={[styles.input, { borderColor: error ? C.red : C.gray, color: C.secondary, backgroundColor: C.offwhite }]}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          placeholder="123456"
          placeholderTextColor={C.gray2}
          maxLength={6}
          value={code}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, "");
            setCode(digits);
            setError(undefined);
            if (digits.length === 6) void verify(digits); // auto-submit on the 6th digit
          }}
          autoFocus
          editable={!loading}
          accessibilityLabel="One-time code"
        />
        {error ? (
          <>
            <HeightSpacer height={6} />
            <ReusableText text={error} family="regular" size={SIZES.xSmall} color={C.red} />
          </>
        ) : null}

        <HeightSpacer height={24} />
        <ReusableBtn
          onPress={() => void verify()}
          btnText={loading ? "Verifying…" : "Verify"}
          backgroundColor={loading ? C.gray2 : C.primary}
          textColor={C.white}
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
          disabled={loading}
        />
        <HeightSpacer height={12} />
        <View style={styles.row}>
          <ReusableBtn
            onPress={() => void resend()}
            btnText={resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            backgroundColor="transparent"
            textColor={cooldown > 0 || resending ? C.gray2 : C.primary}
            height={44}
            borderRadius={12}
            fontSize={SIZES.small}
            disabled={cooldown > 0 || resending}
          />
          <ReusableBtn
            onPress={() => navigation.goBack()}
            btnText="Change number"
            backgroundColor="transparent"
            textColor={C.gray2}
            height={44}
            borderRadius={12}
            fontSize={SIZES.small}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  input: { height: 52, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, fontFamily: "regular", fontSize: SIZES.medium, letterSpacing: 6 },
  row: { flexDirection: "row", gap: 8 },
});
