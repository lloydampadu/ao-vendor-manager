import React, { useState, useEffect, useRef } from "react";
import {
  Alert, ActivityIndicator, View, TextInput, StyleSheet,
  TouchableOpacity, Animated, PanResponder, Dimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import NetworkImage from "./Reusable/NetworkImage";
import HeightSpacer from "./Reusable/HeightSpacer";
import { COLORS, SIZES } from "../constants/theme";
import { uploadImage } from "../lib/upload";
import { api } from "../lib/api";
import { Ionicons } from "@expo/vector-icons";

const CONDITION_OPTIONS = ["Brand New", "Home Used"] as const;
type Condition = (typeof CONDITION_OPTIONS)[number];
const PHOTO_WINDOW_SECONDS = 90;
const SLIDE_THRESHOLD = 0.7; // 70% of track width to confirm

export type QuotePayload = {
  priceGhs: number;
  availability: Condition;
  photos: string[];
  location?: { latitude: number; longitude: number };
};

type Props = {
  assignmentId: string;
  feePaid?: boolean;
  partName?: string;
  onSubmit: (payload: QuotePayload) => Promise<void>;
  initialValues?: { priceGhs: number; availability: string; photos?: string[] };
  submitLabel?: string;
};

// ── Slide-to-confirm component ────────────────────────────────────────────────
const TRACK_WIDTH = Dimensions.get("window").width - 24 * 2 - 32; // card padding
const THUMB_SIZE = 48;
const MAX_SLIDE = TRACK_WIDTH - THUMB_SIZE - 4;
const CENTER = MAX_SLIDE / 2; // thumb starts in the middle — far from iOS swipe-back edge

function SlideToConfirm({ onConfirmed }: { onConfirmed: () => void }) {
  const x = useRef(new Animated.Value(CENTER)).current;
  const confirmed = useRef(false);
  const posRef = useRef(CENTER); // track current position for release check

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      const next = Math.max(0, Math.min(CENTER + g.dx, MAX_SLIDE));
      posRef.current = next;
      x.setValue(next);
    },
    onPanResponderRelease: () => {
      if (confirmed.current) return;
      // Confirm if dragged far enough in either direction.
      const ratio = Math.abs(posRef.current - CENTER) / CENTER;
      if (ratio >= SLIDE_THRESHOLD) {
        confirmed.current = true;
        const target = posRef.current > CENTER ? MAX_SLIDE : 0;
        Animated.spring(x, { toValue: target, useNativeDriver: false }).start();
        onConfirmed();
      } else {
        Animated.spring(x, { toValue: CENTER, useNativeDriver: false }).start();
      }
    },
  });

  // Opacity grows as thumb moves away from center in either direction.
  const bgOpacity = x.interpolate({
    inputRange: [0, CENTER, MAX_SLIDE],
    outputRange: [1, 0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={slide.track}>
      <Animated.View style={[StyleSheet.absoluteFill, slide.fill, { opacity: bgOpacity }]} />
      <ReusableText text="← Slide to confirm you have this part →" family="regular" size={12} color={COLORS.gray2} />
      <Animated.View style={[slide.thumb, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Ionicons name="swap-horizontal" size={20} color={COLORS.white} />
      </Animated.View>
    </View>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function QuoteForm({
  assignmentId,
  feePaid = false,
  partName,
  onSubmit,
  initialValues,
  submitLabel,
}: Props): React.JSX.Element {
  const [price, setPrice] = useState(initialValues?.priceGhs != null ? String(initialValues.priceGhs) : "");
  const [condition, setCondition] = useState<Condition>(
    CONDITION_OPTIONS.includes(initialValues?.availability as Condition)
      ? (initialValues!.availability as Condition)
      : "Brand New",
  );
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
          Alert.alert("Time's up", "You didn't take a photo in time. Slide again to try.");
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
      Alert.alert("Camera required", "Please allow camera access to prove you have this part.");
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
      // Ask Haiku whether the photo actually shows the requested part.
      if (partName && feePaid) {
        setVerifying(true);
        try {
          const result = await api.post<{ match: boolean; reason: string }>(
            `/vendor/requests/${assignmentId}/verify-photo`,
            { imageUrl: url, partName },
          );
          setVerifyResult(result);
        } catch {
          setVerifyResult(null);
        } finally {
          setVerifying(false);
        }
      }
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
    const priceNum = parseInt(price, 10);
    if (!priceNum || priceNum <= 0) { Alert.alert("Enter a valid price in GHS"); return; }
    if (feePaid && !photoUrl) { Alert.alert("Photo required", "Slide to confirm you have the part and take a photo."); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        priceGhs: priceNum,
        availability: condition,
        photos: photoUrl ? [photoUrl] : [],
        ...(location ? { location } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const timerColor = secondsLeft <= 15 ? "#dc2626" : secondsLeft <= 30 ? "#d97706" : COLORS.primary;

  return (
    <View>
      <ReusableText text="Price (GHS)" family="medium" size={SIZES.small} color={COLORS.secondary} />
      <HeightSpacer height={6} />
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        keyboardType="number-pad"
        placeholder="e.g. 250"
        placeholderTextColor={COLORS.gray2}
      />

      <HeightSpacer height={12} />
      <ReusableText text="Condition" family="medium" size={SIZES.small} color={COLORS.secondary} />
      <HeightSpacer height={6} />
      <View style={styles.conditionRow}>
        {CONDITION_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.conditionOption, condition === opt && styles.conditionActive]}
            onPress={() => setCondition(opt)}
          >
            <ReusableText
              text={opt}
              family={condition === opt ? "medium" : "regular"}
              size={SIZES.small}
              color={condition === opt ? COLORS.primary : COLORS.gray2}
            />
          </TouchableOpacity>
        ))}
      </View>

      {feePaid && (
        <>
          <HeightSpacer height={20} />

          {/* Photo already taken */}
          {photoUrl ? (
            <View>
              <View style={styles.proofRow}>
                <NetworkImage source={localUri!} width={80} height={80} radius={8} />
                <View style={{ flex: 1 }}>
                  <ReusableText text="✓ Proof photo taken" family="medium" size={SIZES.small} color="#16a34a" />
                  {location && (
                    <>
                      <HeightSpacer height={4} />
                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={11} color={COLORS.gray2} />
                        <ReusableText
                          text={`  ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                          family="regular"
                          size={11}
                          color={COLORS.gray2}
                        />
                      </View>
                    </>
                  )}
                  {/* AI verification result */}
                  {(verifying || verifyResult) && <HeightSpacer height={8} />}
                  {verifying && (
                    <View style={styles.verifyRow}>
                      <ActivityIndicator size="small" color={COLORS.gray2} />
                      <ReusableText text="  Checking photo…" family="regular" size={11} color={COLORS.gray2} />
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
                    <ReusableText text="Retake photo" family="regular" size={11} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
                {uploading && <ActivityIndicator color={COLORS.primary} />}
              </View>
            </View>
          ) : confirmed ? (
            /* Confirmed, camera open / counting down */
            <View style={styles.countdownBox}>
              <ReusableText text="Take the photo now!" family="bold" size={15} color={timerColor} />
              <HeightSpacer height={6} />
              <ReusableText
                text={`${secondsLeft}s remaining`}
                family="medium"
                size={28}
                color={timerColor}
              />
              <HeightSpacer height={10} />
              <TouchableOpacity style={styles.cameraBtn} onPress={() => void openCamera()} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={COLORS.primary} />
                  : <><Ionicons name="camera" size={22} color={COLORS.primary} /><ReusableText text="Open Camera" family="medium" size={12} color={COLORS.primary} /></>
                }
              </TouchableOpacity>
            </View>
          ) : (
            /* Not yet confirmed */
            <View>
              <ReusableText text="Do you have this part?" family="medium" size={SIZES.small} color={COLORS.secondary} />
              <HeightSpacer height={4} />
              <ReusableText
                text="Slide to confirm — you'll have 90 seconds to take a live photo as proof."
                family="regular"
                size={11}
                color={COLORS.gray2}
              />
              <HeightSpacer height={12} />
              <SlideToConfirm onConfirmed={() => { setExpired(false); setConfirmed(true); }} />
            </View>
          )}
        </>
      )}

      <HeightSpacer height={20} />
      <ReusableBtn
        onPress={() => void submit()}
        btnText={submitting ? "Saving…" : (submitLabel ?? "Submit Quote")}
        backgroundColor={submitting ? COLORS.gray2 : COLORS.primary}
        textColor={COLORS.white}
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
    borderColor: COLORS.gray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    color: COLORS.secondary,
    backgroundColor: COLORS.white,
    fontFamily: "regular",
  },
  conditionRow: { flexDirection: "row", gap: 10 },
  conditionOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.gray,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  conditionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary1 },
  proofRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  locationRow: { flexDirection: "row", alignItems: "center" },
  verifyRow: { flexDirection: "row", alignItems: "flex-start" },
  countdownBox: {
    alignItems: "center",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary1,
  },
  cameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
});

const slide = StyleSheet.create({
  track: {
    height: THUMB_SIZE + 4,
    borderRadius: (THUMB_SIZE + 4) / 2,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  fill: {
    backgroundColor: COLORS.primary,
    borderRadius: (THUMB_SIZE + 4) / 2,
  },
  thumb: {
    position: "absolute",
    left: 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
