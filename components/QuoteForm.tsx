import React, { useState } from "react";
import { View, TextInput, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import * as ImagePicker from "expo-image-picker";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import NetworkImage from "./Reusable/NetworkImage";
import HeightSpacer from "./Reusable/HeightSpacer";
import { COLORS, SIZES } from "../constants/theme";
import { uploadImage } from "../lib/upload";

const AVAILABILITY_OPTIONS = [
  "In stock",
  "Can source in 1 day",
  "Can source in 2–3 days",
  "Can source in 1 week",
];

type QuotePayload = {
  priceGhs: number;
  availability: string;
  notes?: string;
  photos: string[];
};

type Props = {
  assignmentId: string;
  onSubmit: (payload: QuotePayload) => Promise<void>;
};

export function QuoteForm({ assignmentId: _assignmentId, onSubmit }: Props): React.JSX.Element {
  const [price, setPrice] = useState("");
  const [availability, setAvailability] = useState(AVAILABILITY_OPTIONS[0]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [localUris, setLocalUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickPhoto() {
    if (photos.length >= 4) { Alert.alert("Max 4 photos"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setLocalUris((p) => [...p, uri]);
    setUploading(true);
    try {
      const url = await uploadImage(uri);
      setPhotos((p) => [...p, url]);
    } catch (e) {
      setLocalUris((p) => p.filter((u) => u !== uri));
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const priceNum = parseInt(price, 10);
    if (!priceNum || priceNum <= 0) { Alert.alert("Enter a valid price in GHS"); return; }
    setSubmitting(true);
    try {
      await onSubmit({ priceGhs: priceNum, availability, notes: notes.trim() || undefined, photos });
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
      <ReusableText text="Availability" family="medium" size={SIZES.small} color={COLORS.secondary} />
      <HeightSpacer height={6} />
      {AVAILABILITY_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.option, availability === opt && styles.optionActive]}
          onPress={() => setAvailability(opt)}
        >
          <ReusableText
            text={opt}
            family={availability === opt ? "medium" : "regular"}
            size={SIZES.small}
            color={availability === opt ? COLORS.primary : COLORS.gray2}
          />
        </TouchableOpacity>
      ))}

      <HeightSpacer height={12} />
      <ReusableText text="Notes (optional)" family="medium" size={SIZES.small} color={COLORS.secondary} />
      <HeightSpacer height={6} />
      <TextInput
        style={[styles.input, styles.textarea]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Brand, condition, any extras..."
        placeholderTextColor={COLORS.gray2}
      />

      <HeightSpacer height={12} />
      <ReusableText text={`Photos (${photos.length}/4)`} family="medium" size={SIZES.small} color={COLORS.secondary} />
      <HeightSpacer height={6} />
      <View style={styles.photoRow}>
        {localUris.map((uri, i) => (
          <NetworkImage key={i} source={uri} width={70} height={70} radius={6} />
        ))}
        {photos.length < 4 && (
          <TouchableOpacity
            style={styles.addPhoto}
            onPress={() => void pickPhoto()}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <ReusableText text="+ Add" family="medium" size={SIZES.small} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <HeightSpacer height={16} />
      <ReusableBtn
        onPress={() => void submit()}
        btnText={submitting ? "Submitting…" : "Submit Quote"}
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
  textarea: { height: 80, textAlignVertical: "top" },
  option: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.gray,
    marginBottom: 6,
    backgroundColor: COLORS.white,
  },
  optionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary1 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addPhoto: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary1,
  },
});
