import React, { useState } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { ReusableBtn, ReusableText, HeightSpacer } from '../../components';
import { COLORS, SIZES } from '../../constants/theme';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props): React.JSX.Element {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function send(): Promise<void> {
    if (!/^0\d{9}$/.test(phone)) {
      setError('Enter a valid Ghana number (e.g. 0244123456)');
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await api.post('/vendor-auth/otp/send', { phone });
      navigation.navigate('OTP', { phone });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ReusableText text="AO Direct" family="xtrabold" size={SIZES.large} color={COLORS.primary} />
        <HeightSpacer height={8} />
        <ReusableText text="Vendor sign-in" family="bold" size={32} color={COLORS.secondary} />
        <HeightSpacer height={8} />
        <ReusableText
          text="Enter the phone number registered with AbosseyOkai Direct."
          family="regular"
          size={SIZES.small}
          color={COLORS.gray2}
        />
        <HeightSpacer height={24} />

        <ReusableText text="Phone number" family="medium" size={SIZES.small} color={COLORS.secondary} />
        <HeightSpacer height={6} />
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          keyboardType="phone-pad"
          placeholder="0244 123 456"
          placeholderTextColor={COLORS.gray2}
          value={phone}
          onChangeText={(t) => { setPhone(t); setError(undefined); }}
        />
        {error ? (
          <>
            <HeightSpacer height={4} />
            <ReusableText text={error} family="regular" size={SIZES.xSmall} color={COLORS.red} />
          </>
        ) : null}

        <HeightSpacer height={24} />
        <ReusableBtn
          onPress={() => void send()}
          btnText={loading ? 'Sending…' : 'Send code'}
          backgroundColor={loading ? COLORS.gray2 : COLORS.primary}
          textColor={COLORS.white}
          width="100%"
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
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
  },
  inputError: { borderColor: COLORS.red },
});
