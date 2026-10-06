import React, { useState } from "react";
import {
  Alert, ActivityIndicator, ScrollView, View, TextInput, StyleSheet,
  TouchableOpacity,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import NetworkImage from "./Reusable/NetworkImage";
import HeightSpacer from "./Reusable/HeightSpacer";
import { SIZES, useThemeColors } from "../constants/theme";
import { uploadImage } from "../lib/upload";
import { Ionicons } from "@expo/vector-icons";

const CONDITION_OPTIONS = ["Brand New", "Home Used"] as const;
type Condition = (typeof CONDITION_OPTIONS)[number];
const MAX_PHOTOS_PER_CONDITION = 4;

export type PriceEntry = { condition: Condition; priceGhs: number };

export type QuotePayload = {
  prices: PriceEntry[];
  // photos per condition: { "Brand New": [...urls], "Home Used": [...urls] }
  photosByCondition: Partial<Record<Condition, string[]>>;
  // flat list for backward compat with existing API/DB fields
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

export function QuoteForm({
  assignmentId,
  feePaid = false,
  partName,
  onSubmit,
  initialValues,
  submitLabel,
}: Props): React.JSX.Element {
  const C = useThemeColors();

  const initPrices = (): Record<Condition, string> => {
    if (initialValues?.prices && initialValues.prices.length > 0) {
      const map: Record<Condition, string> = { "Brand New": "", "Home Used": "" };
      initialValues.prices.forEach((p) => { map[p.condition] = String(p.priceGhs); });
      return map;
    }
    const cond = CONDITION_OPTIONS.includes(initialValues?.availability as Condition)
      ? (initialValues!.availability as Condition)
      : "Brand New";
    return {
      "Brand New": cond === "Brand New" ? String(initialValues?.priceGhs ?? "") : "",
      "Home Used": cond === "Home Used" ? String(initialValues?.priceGhs ?? "") : "",
    };
  };

  const [prices, setPrices] = useState<Record<Condition, string>>(initPrices);

  // Multiple photos per condition: condition → array of { localUri, uploadedUrl | null }
  type PhotoEntry = { localUri: string; url: string | null };
  const [photosByCondition, setPhotosByCondition] = useState<Partial<Record<Condition, PhotoEntry[]>>>({});

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Which condition has the camera open (blocks double-tap)
  const [pendingCondition, setPendingCondition] = useState<Condition | null>(null);

  // Conditions with a filled price
  const filledConditions = CONDITION_OPTIONS.filter((c) => parseInt(prices[c], 10) > 0);

  // All photos uploaded (no pending null url) and each filled condition has ≥1 photo
  const allPhotosDone = feePaid
    ? filledConditions.every((c) => {
        const entries = photosByCondition[c] ?? [];
        return entries.length > 0 && entries.every((p) => p.url !== null);
      })
    : true;

  const uploadingForCondition = (cond: Condition) =>
    (photosByCondition[cond] ?? []).some((p) => p.url === null);

  async function openCamera(forCondition: Condition) {
    setPendingCondition(forCondition);
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert("Camera needed", "Please allow camera access to continue.");
      setPendingCondition(null);
      return;
    }
    const locPerm = await Location.requestForegroundPermissionsAsync();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (result.canceled) {
      setPendingCondition(null);
      return;
    }

    setPendingCondition(null);

    const uri = result.assets[0].uri;
    // Add a pending entry (url = null while uploading)
    setPhotosByCondition((prev) => ({
      ...prev,
      [forCondition]: [...(prev[forCondition] ?? []), { localUri: uri, url: null }],
    }));

    if (locPerm.granted && !location) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        .catch(() => {});
    }

    try {
      const url = await uploadImage(uri);
      setPhotosByCondition((prev) => {
        const entries = [...(prev[forCondition] ?? [])];
        let idx = -1;
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].localUri === uri && entries[i].url === null) { idx = i; break; }
        }
        if (idx !== -1) entries[idx] = { ...entries[idx], url };
        return { ...prev, [forCondition]: entries };
      });
    } catch (e) {
      // Remove the failed entry
      setPhotosByCondition((prev) => ({
        ...prev,
        [forCondition]: (prev[forCondition] ?? []).filter((e) => !(e.localUri === uri && e.url === null)),
      }));
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photo");
    }
  }

  function removePhoto(condition: Condition, index: number) {
    setPhotosByCondition((prev) => {
      const entries = [...(prev[condition] ?? [])];
      entries.splice(index, 1);
      return { ...prev, [condition]: entries };
    });
  }

  async function submit() {
    const priceEntries: PriceEntry[] = CONDITION_OPTIONS
      .map((c) => ({ condition: c, priceGhs: parseInt(prices[c], 10) }))
      .filter((e) => e.priceGhs > 0);
    if (priceEntries.length === 0) {
      Alert.alert("No price entered", "Please enter a price for at least one condition.");
      return;
    }
    if (feePaid) {
      // Check all photos are uploaded (no pending null)
      const stillUploading = priceEntries.some((e) => uploadingForCondition(e.condition));
      if (stillUploading) { Alert.alert("Please wait", "Photos are still uploading."); return; }
      const missing = priceEntries.filter((e) => !(photosByCondition[e.condition]?.length));
      if (missing.length > 0) {
        Alert.alert(
          "Photo needed",
          missing.length > 1
            ? "Please take at least one photo for each condition."
            : `Please take at least one photo of the ${missing[0].condition} part.`,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const byCondition: Partial<Record<Condition, string[]>> = {};
      priceEntries.forEach((e) => {
        byCondition[e.condition] = (photosByCondition[e.condition] ?? [])
          .map((p) => p.url)
          .filter((u): u is string => !!u);
      });
      // Flat list — all photos in condition order, for backward compat
      const flatPhotos = priceEntries.flatMap((e) => byCondition[e.condition] ?? []);
      await onSubmit({
        prices: priceEntries,
        photosByCondition: byCondition,
        photos: flatPhotos,
        ...(location ? { location } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <ReusableText text="Your price (GHS)" family="medium" size={SIZES.small} color={C.secondary} />
      <HeightSpacer height={4} />
      <ReusableText
        text="Enter a price for each type you have. Leave blank if you don't have it."
        family="regular"
        size={11}
        color={C.gray2}
      />
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

      {feePaid && filledConditions.length > 0 && (
        <>
          <HeightSpacer height={20} />

          {filledConditions.map((cond) => {
            const entries = photosByCondition[cond] ?? [];
            const hasPhotos = entries.length > 0;
            const canAddMore = entries.length < MAX_PHOTOS_PER_CONDITION;
            const isUploading = uploadingForCondition(cond);

            return (
              <View key={cond} style={[styles.conditionPhotoBlock, { borderColor: C.gray, backgroundColor: C.white }]}>
                {/* Header row */}
                <View style={styles.conditionPhotoHeader}>
                  <View style={styles.conditionBadge}>
                    <Ionicons
                      name={cond === "Brand New" ? "sparkles-outline" : "refresh-outline"}
                      size={14}
                      color={C.primary}
                    />
                    <ReusableText text={`  ${cond}`} family="bold" size={SIZES.small} color={C.primary} />
                  </View>
                  <ReusableText
                    text={`${entries.filter((e) => e.url).length}/${MAX_PHOTOS_PER_CONDITION} photos`}
                    family="regular"
                    size={11}
                    color={C.gray2}
                  />
                </View>

                {/* Thumbnail strip */}
                {hasPhotos && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbStrip}>
                    {entries.map((entry, i) => (
                      <View key={entry.localUri} style={styles.thumbWrap}>
                        <NetworkImage source={entry.localUri} width={72} height={72} radius={8} />
                        {entry.url === null && (
                          <View style={styles.thumbUploadingOverlay}>
                            <ActivityIndicator color="#fff" size="small" />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.thumbRemove}
                          onPress={() => removePhoto(cond, i)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* Add photo button */}
                {canAddMore && !pendingCondition && (
                  <TouchableOpacity
                    style={[styles.addPhotoBtn, { borderColor: C.primary, backgroundColor: C.primary1 }]}
                    onPress={() => { void openCamera(cond); }}
                    disabled={isUploading}
                  >
                    <Ionicons name="camera-outline" size={18} color={C.primary} />
                    <ReusableText
                      text={hasPhotos ? "  Add another photo" : "  Take a photo"}
                      family="medium"
                      size={SIZES.small}
                      color={C.primary}
                    />
                  </TouchableOpacity>
                )}

                {!canAddMore && (
                  <ReusableText text="Max 4 photos reached" family="regular" size={11} color={C.gray2} />
                )}
              </View>
            );
          })}

          {location && allPhotosDone && (
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
  conditionPriceInput: { flex: 1 },
  conditionPhotoBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  conditionPhotoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  conditionBadge: { flexDirection: "row", alignItems: "center" },
  thumbStrip: { flexGrow: 0 },
  thumbWrap: {
    position: "relative",
    marginRight: 8,
  },
  thumbUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  addPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  locationRow: { flexDirection: "row", alignItems: "center" },
});
