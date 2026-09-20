import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { registerPushToken } from '@/lib/notifications';
import { ReusableBtn, ReusableText, HeightSpacer } from '../../components';
import { COLORS, SIZES } from '../../constants/theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OTP'>;
type VerifyResponse = { token: string; vendor: { id: string; name: string; phone: string; categories: string[] } };

export default function OTPScreen({ route, navigation }: Props): React.JSX.Element {
  const { phone } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { setAuth } = useAuthStore();

  async function verify(): Promise<void> {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    setError(undefined);
    setLoading(true);
    try {
      const { token, vendor } = await api.post<VerifyResponse>('/vendor-auth/otp/verify', { phone, code });
      await setAuth(token, vendor);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      registerPushToken().catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ReusableText text="Enter code" family="bold" size={32} color={COLORS.secondary} />
        <HeightSpacer height={8} />
        <ReusableText
          text={`We sent a 6-digit code to ${phone}.`}
          family="regular"
          size={SIZES.small}
          color={COLORS.gray2}
        />
        <HeightSpacer height={24} />

        <ReusableText text="Code" family="medium" size={SIZES.small} color={COLORS.secondary} />
        <HeightSpacer height={6} />
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor={COLORS.gray2}
          maxLength={6}
          value={code}
          onChangeText={(t) => { setCode(t); setError(undefined); }}
          autoFocus
        />
        {error ? (
          <>
            <HeightSpacer height={4} />
            <ReusableText text={error} family="regular" size={SIZES.xSmall} color={COLORS.red} />
          </>
        ) : null}

        <HeightSpacer height={24} />
        <ReusableBtn
          onPress={() => void verify()}
          btnText={loading ? 'Verifying…' : 'Verify'}
          backgroundColor={loading ? COLORS.gray2 : COLORS.primary}
          textColor={COLORS.white}
          width="100%"
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
        />
        <HeightSpacer height={12} />
        <ReusableBtn
          onPress={() => navigation.goBack()}
          btnText="Use a different number"
          backgroundColor="transparent"
          textColor={COLORS.gray2}
          width="100%"
          height={44}
          borderRadius={12}
          fontSize={SIZES.small}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: COLORS.gray,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'regular',
    fontSize: SIZES.medium,
    color: COLORS.black,
    backgroundColor: COLORS.offwhite,
    letterSpacing: 6,
  },
  inputError: { borderColor: COLORS.red },
});
