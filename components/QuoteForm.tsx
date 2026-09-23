import React, { useState, useEffect, useRef } from "react";
import {
  Alert, ActivityIndicator, View, TextInput, StyleSheet,
  TouchableOpacity,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import NetworkImage from "./Reusable/NetworkImage";
import HeightSpacer from "./Reusable/HeightSpacer";
import { COLORS, SIZES, useThemeColors } from "../constants/theme";
import { uploadImage } from "../lib/upload";
import { api } from "../lib/api";
import { Ionicons } from "@expo/vector-icons";

const CONDITION_OPTIONS = ["Brand New", "Home Used"] as const;
type Condition = (typeof CONDITION_OPTIONS)[number];
const PHOTO_WINDOW_SECONDS = 90;

export type PriceEntry = { condition: Condition; priceGhs: number };

export type QuotePayload = {
  prices: PriceEntry[];
  photos: string[];
  location?: { latitude: number; longitude: number };
};

type Props = {
  assignmentId: string;
  feePaid?: boolean;
  partName?: string;
  onSubmit: (payload: QuotePayload) => Promise<void>;
  initialValues?: { priceGhs: number; availability: string; photos?: string[]; prices?: PriceEntry[] };
  submitLabel?: string;
};


// ── Main form ─────────────────────────────────────────────────────────────────
export function QuoteForm({
  assignmentId,
  feePaid = false,
  partName,
  onSubmit,
  initialValues,
  submitLabel,
}: Props): React.JSX.Element {
  const C = useThemeColors();
  // Per-condition prices: { "Brand New": "250", "Home Used": "" }
  const initPrices = (): Record<Condition, string> => {
    if (initialValues?.prices && initialValues.prices.length > 0) {
      const map: Record<Condition, string> = { "Brand New": "", "Home Used": "" };
      initialValues.prices.forEach((p) => { map[p.condition] = String(p.priceGhs); });
      return map;
    }
    // Legacy single value
    const cond = CONDITION_OPTIONS.includes(initialValues?.availability as Condition)
      ? (initialValues!.availability as Condition)
      : "Brand New";
    return { "Brand New": cond === "Brand New" ? String(initialValues?.priceGhs ?? "") : "", "Home Used": cond === "Home Used" ? String(initialValues?.priceGhs ?? "") : "" };
  };
  const [prices, setPrices] = useState<Record<Condition, string>>(initPrices);
  const [confirmed, setConfirmed] = useState(!!initialValues?.photos?.[0]);
  const [secondsLeft, setSecondsLeft] = useState(PHOTO_WINDOW_SECONDS);
  const [expired, setExpired] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialValues?.photos?.[0] ?? null);
  const [localUri, setLocalUri] = useState<string | null>(initialValues?.photos?.[0] ?? null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ match: boolean; reason: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start countdown when vendor confirms they have the part.
  useEffect(() => {
    if (!confirmed || photoUrl || expired) return;
    setSecondsLeft(PHOTO_WINDOW_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          setExpired(true);
          setConfirmed(false);
          Alert.alert("Too slow", "You didn't take a photo in time. Try again.");
          return PHOTO_WINDOW_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    // Open camera immediately
    void openCamera();
    return () => clearInterval(timerRef.current!);
  }, [confirmed]);

  // Stop timer once photo is taken.
  useEffect(() => {
    if (photoUrl && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [photoUrl]);

  async function openCamera() {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert("Camera needed", "Please allow camera access to continue.");
      setConfirmed(false);
      return;
    }
    const locPerm = await Location.requestForegroundPermissionsAsync();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (result.canceled) {
      // They dismissed camera — reset so timer doesn't keep running with no photo
      setConfirmed(false);
      clearInterval(timerRef.current!);
      return;
    }
    const uri = result.assets[0].uri;
    setLocalUri(uri);
    setUploading(true);
    if (locPerm.granted) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        .catch(() => {});
    }
    try {
      const url = await uploadImage(uri);
      setPhotoUrl(url);
      // Haiku photo verification — disabled for now
    } catch (e) {
      setLocalUri(null);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  function resetPhoto() {
    setPhotoUrl(null);
    setLocalUri(null);
    setLocation(null);
    setVerifyResult(null);
    setVerifying(false);
    setConfirmed(false);
    setExpired(false);
  }

  async function submit() {
    const priceEntries: PriceEntry[] = CONDITION_OPTIONS
      .map((c) => ({ condition: c, priceGhs: parseInt(prices[c], 10) }))
      .filter((e) => e.priceGhs > 0);
    if (priceEntries.length === 0) { Alert.alert("No price entered", "Please enter a price for at least one condition."); return; }
    if (feePaid && !photoUrl) { Alert.alert("Photo needed", "Please slide to confirm you have the part, then take a photo."); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        prices: priceEntries,
        photos: photoUrl ? [photoUrl] : [],
        ...(location ? { location } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const timerColor = secondsLeft <= 15 ? "#dc2626" : secondsLeft <= 30 ? "#d97706" : C.primary;

  return (
    <View>
      <ReusableText text="Your price (GHS)" family="medium" size={SIZES.small} color={C.secondary} />
      <HeightSpacer height={4} />
      <ReusableText text="Enter a price for each type you have. Leave blank if you don't have it." family="regular" size={11} color={C.gray2} />
      <HeightSpacer height={10} />
      {CONDITION_OPTIONS.map((opt) => (
        <View key={opt} style={styles.conditionPriceRow}>
          <View style={styles.conditionLabel}>
            <ReusableText text={opt} family="medium" size={SIZES.small} color={C.secondary} />
          </View>
          <TextInput
            style={[styles.input, styles.conditionPriceInput, { borderColor: C.gray, color: C.secondary, backgroundColor: C.white }]}
            value={prices[opt]}
            onChangeText={(v) => setPrices((prev) => ({ ...prev, [opt]: v }))}
            keyboardType="number-pad"
            placeholder="Leave empty if you don't have it"
            placeholderTextColor={C.gray2}
          />
        </View>
      ))}

      {feePaid && (
        <>
          <HeightSpacer height={20} />

          {/* Photo already taken */}
          {photoUrl ? (
            <View>
              <View style={styles.proofRow}>
                <NetworkImage source={localUri!} width={80} height={80} radius={8} />
                <View style={{ flex: 1 }}>
                  <ReusableText text="✓ Photo taken" family="medium" size={SIZES.small} color="#16a34a" />
                  {location && (
                    <>
                      <HeightSpacer height={4} />
                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={11} color={C.gray2} />
                        <ReusableText
                          text={`  ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                          family="regular"
                          size={11}
                          color={C.gray2}
                        />
                      </View>
                    </>
                  )}
                  {(verifying || verifyResult) && <HeightSpacer height={8} />}
                  {verifying && (
                    <View style={styles.verifyRow}>
                      <ActivityIndicator size="small" color={C.gray2} />
                      <ReusableText text="  Checking photo…" family="regular" size={11} color={C.gray2} />
                    </View>
                  )}
                  {!verifying && verifyResult && (
                    <View style={styles.verifyRow}>
                      <Ionicons
                        name={verifyResult.match ? "checkmark-circle" : "warning"}
                        size={14}
                        color={verifyResult.match ? "#16a34a" : "#d97706"}
                      />
                      <ReusableText
                        text={`  ${verifyResult.reason}`}
                        family="regular"
                        size={11}
                        color={verifyResult.match ? "#16a34a" : "#d97706"}
                      />
                    </View>
                  )}
                  <HeightSpacer height={8} />
                  <TouchableOpacity onPress={resetPhoto}>
                    <ReusableText text="Take again" family="regular" size={11} color={C.primary} />
                  </TouchableOpacity>
                </View>
                {uploading && <ActivityIndicator color={C.primary} />}
              </View>
            </View>
          ) : confirmed ? (
            /* Confirmed, camera open / counting down */
            <View style={[styles.countdownBox, { borderColor: C.primary, backgroundColor: C.primary1 }]}>
              <ReusableText text="Take the photo now!" family="bold" size={15} color={timerColor} />
              <HeightSpacer height={6} />
              <ReusableText
                text={`${secondsLeft} seconds left`}
                family="medium"
                size={28}
                color={timerColor}
              />
              <HeightSpacer height={10} />
              <TouchableOpacity style={[styles.cameraBtn, { borderColor: C.primary, backgroundColor: C.white }]} onPress={() => void openCamera()} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={C.primary} />
                  : <><Ionicons name="camera" size={22} color={C.primary} /><ReusableText text="Open Camera" family="medium" size={12} color={C.primary} /></>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <ReusableText text="Do you have this part?" family="medium" size={SIZES.small} color={C.secondary} />
              <HeightSpacer height={4} />
              <ReusableText
                text="Tap the button below to confirm. You will have 90 seconds to take a photo."
                family="regular"
                size={11}
                color={C.gray2}
              />
              <HeightSpacer height={12} />
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: C.primary }]}
                onPress={() => { setExpired(false); setConfirmed(true); }}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={C.white} />
                <ReusableText text="  Yes, I have this part" family="medium" size={SIZES.small} color={C.white} />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <HeightSpacer height={20} />
      <ReusableBtn
        onPress={() => void submit()}
        btnText={submitting ? "Sending…" : (submitLabel ?? "Send Quote")}
        backgroundColor={submitting ? C.gray2 : C.primary}
        textColor={C.white}
        width="100%"
        height={52}
        borderRadius={10}
        fontSize={SIZES.medium}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    fontFamily: "regular",
  },
  conditionPriceRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  conditionLabel: { width: 90 },
  conditionPriceInput: { flex: 1, marginBottom: 0 },
  proofRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  locationRow: { flexDirection: "row", alignItems: "center" },
  verifyRow: { flexDirection: "row", alignItems: "flex-start" },
  countdownBox: {
    alignItems: "center",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
  },
});
