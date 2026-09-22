import React, { useState } from "react";
import { Alert, ActivityIndicator, View, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import NetworkImage from "./Reusable/NetworkImage";
import HeightSpacer from "./Reusable/HeightSpacer";
import { COLORS, SIZES } from "../constants/theme";
import { uploadImage } from "../lib/upload";
import { Ionicons } from "@expo/vector-icons";

const CONDITION_OPTIONS = ["Brand New", "Home Used"] as const;
type Condition = (typeof CONDITION_OPTIONS)[number];

export type QuotePayload = {
  priceGhs: number;
  availability: Condition;
  photos: string[];
  location?: { latitude: number; longitude: number };
};

type Props = {
  assignmentId: string;
  feePaid?: boolean;
  onSubmit: (payload: QuotePayload) => Promise<void>;
  initialValues?: { priceGhs: number; availability: string; photos?: string[] };
  submitLabel?: string;
};

export function QuoteForm({ assignmentId: _assignmentId, feePaid = false, onSubmit, initialValues, submitLabel }: Props): React.JSX.Element {
  const [price, setPrice] = useState(initialValues?.priceGhs != null ? String(initialValues.priceGhs) : "");
  const [condition, setCondition] = useState<Condition>(
    CONDITION_OPTIONS.includes(initialValues?.availability as Condition)
      ? (initialValues!.availability as Condition)
      : "Brand New"
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialValues?.photos?.[0] ?? null);
  const [localUri, setLocalUri] = useState<string | null>(initialValues?.photos?.[0] ?? null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function takePhoto() {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert("Camera permission required", "Please allow camera access to take a proof photo.");
      return;
    }
    const locPerm = await Location.requestForegroundPermissionsAsync();

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setLocalUri(uri);
    setUploading(true);

    // Capture location in parallel with upload.
    if (locPerm.granted) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        .catch(() => {});
    }

    try {
      const url = await uploadImage(uri);
      setPhotoUrl(url);
    } catch (e) {
      setLocalUri(null);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const priceNum = parseInt(price, 10);
    if (!priceNum || priceNum <= 0) { Alert.alert("Enter a valid price in GHS"); return; }
    if (feePaid && !photoUrl) { Alert.alert("Photo required", "Please take a photo of the item as proof."); return; }
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
          <HeightSpacer height={16} />
          <ReusableText text="Proof Photo *" family="medium" size={SIZES.small} color={COLORS.secondary} />
          <HeightSpacer height={4} />
          <ReusableText
            text="Take a live photo of the item to confirm you have it."
            family="regular"
            size={11}
            color={COLORS.gray2}
          />
          <HeightSpacer height={8} />
          <View style={styles.photoRow}>
            {localUri && (
              <NetworkImage source={localUri} width={90} height={90} radius={8} />
            )}
            <TouchableOpacity
              style={[styles.cameraBtn, uploading && { opacity: 0.5 }]}
              onPress={() => void takePhoto()}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="camera" size={22} color={COLORS.primary} />
                  <ReusableText
                    text={localUri ? "Retake" : "Camera"}
                    family="medium"
                    size={11}
                    color={COLORS.primary}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
          {location && (
            <>
              <HeightSpacer height={6} />
              <View style={styles.locationRow}>
                <Ionicons name="location" size={12} color={COLORS.gray2} />
                <ReusableText
                  text={`  ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                  family="regular"
                  size={11}
                  color={COLORS.gray2}
                />
              </View>
            </>
          )}
        </>
      )}

      <HeightSpacer height={16} />
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
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cameraBtn: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: COLORS.primary1,
  },
  locationRow: { flexDirection: "row", alignItems: "center" },
});
