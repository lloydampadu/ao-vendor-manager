import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/upload";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";
import type { Product } from "./ProductsScreen";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditProduct">;

const CONDITIONS: Product["condition"][] = ["NEW", "USED", "REFURBISHED"];
const CONDITION_LABEL: Record<Product["condition"], string> = {
  NEW: "New",
  USED: "Used",
  REFURBISHED: "Refurbished",
};

export default function AddEditProductScreen(): React.JSX.Element {
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.product as Product | undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [price, setPrice] = useState(existing ? String(existing.priceGhs) : "");
  const [condition, setCondition] = useState<Product["condition"]>(existing?.condition ?? "USED");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [localUris, setLocalUris] = useState<string[]>(existing?.photos ?? []);
  const [inStock, setInStock] = useState(existing?.inStock ?? true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function pickPhoto(): Promise<void> {
    if (photos.length >= 4) {
      Alert.alert("You can only add 4 photos");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const localUri = result.assets[0].uri;
    setLocalUris((prev) => [...prev, localUri]);
    setUploading(true);
    try {
      const url = await uploadImage(localUri);
      setPhotos((prev) => [...prev, url]);
    } catch (e) {
      setLocalUris((prev) => prev.filter((u) => u !== localUri));
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload the photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save(): Promise<void> {
    if (!name.trim()) { Alert.alert("Please enter the product name"); return; }
    const priceGhs = parseInt(price, 10);
    if (!priceGhs || priceGhs <= 0) { Alert.alert("Please enter a valid price"); return; }

    if (uploading) { Alert.alert("Please wait", "Photo is still uploading"); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), priceGhs, condition, description: description.trim() || undefined, photos: photos.filter(Boolean), inStock };
      if (existing) {
        await api.patch(`/vendor/products/${existing.id}`, body);
      } else {
        await api.post("/vendor/products", body);
      }
      nav.goBack();
    } catch (e: unknown) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field label="Product Name *">
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Toyota Corolla 2018 Alternator"
          placeholderTextColor={COLORS.gray2}
        />
      </Field>

      <Field label="Price (GHS) *">
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          keyboardType="number-pad"
          placeholder="e.g. 450"
          placeholderTextColor={COLORS.gray2}
        />
      </Field>

      <Field label="Condition">
        <View style={styles.conditionRow}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.conditionBtn, condition === c && styles.conditionBtnActive]}
              onPress={() => setCondition(c)}
            >
              <ReusableText
                text={CONDITION_LABEL[c]}
                family="medium"
                size={13}
                color={condition === c ? COLORS.white : COLORS.gray2}
              />
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="Description (optional)">
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the condition, which cars it fits, etc."
          placeholderTextColor={COLORS.gray2}
          multiline
          numberOfLines={3}
        />
      </Field>

      <Field label={`Photos (${localUris.length}/4)`}>
        <View style={styles.photoGrid}>
          {localUris.map((uri, i) => (
            <View key={i} style={styles.photoWrapper}>
              <Image source={uri} style={styles.photo} contentFit="cover" cachePolicy="disk" />
              <TouchableOpacity
                style={styles.removePhoto}
                onPress={() => {
                  setLocalUris((prev) => prev.filter((_, j) => j !== i));
                  setPhotos((prev) => prev.filter((_, j) => j !== i));
                }}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.red} />
              </TouchableOpacity>
            </View>
          ))}
          {localUris.length < 4 && (
            <TouchableOpacity style={styles.addPhoto} onPress={() => void pickPhoto()} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Ionicons name="camera-outline" size={28} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </Field>

      <TouchableOpacity
        style={[styles.stockToggle, inStock ? styles.stockIn : styles.stockOut]}
        onPress={() => setInStock((v) => !v)}
      >
        <Ionicons name={inStock ? "checkmark-circle" : "close-circle"} size={20} color={inStock ? "#16a34a" : COLORS.red} />
        <ReusableText
          text={`${inStock ? "In Stock" : "Out of Stock"} — tap to toggle`}
          family="medium"
          size={14}
          color={inStock ? "#16a34a" : COLORS.red}
        />
      </TouchableOpacity>

      <HeightSpacer height={4} />
      <ReusableBtn
        onPress={() => void save()}
        btnText={saving ? "Saving…" : uploading ? "Uploading photo…" : existing ? "Save Changes" : "Add Product"}
        backgroundColor={saving || uploading ? COLORS.gray2 : COLORS.primary}
        textColor={COLORS.white}
        width="100%"
        height={52}
        borderRadius={12}
        fontSize={SIZES.medium}
      />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ReusableText text={label} family="bold" size={SIZES.xSmall} color={COLORS.primary} />
      <HeightSpacer height={6} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.offwhite },
  content: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 16 },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.gray,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    color: COLORS.secondary,
    fontFamily: "regular",
  },
  textarea: { height: 80, textAlignVertical: "top" },
  conditionRow: { flexDirection: "row", gap: 8 },
  conditionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.gray,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  conditionBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrapper: { position: "relative" },
  photo: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: { position: "absolute", top: -6, right: -6 },
  addPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.primary1,
  },
  stockToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  stockIn: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  stockOut: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
});
