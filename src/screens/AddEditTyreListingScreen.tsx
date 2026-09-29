import React, { useState, useEffect } from "react";
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
import { uploadImage } from "@/lib/upload";
import {
  initDb,
  upsertTyreListing,
  enqueueTyreListing,
  getCachedTyreCatalog,
} from "@/lib/db";
import type { TyreListing, CatalogBrand } from "@/lib/db";
import { useSyncStore } from "@/store/sync-store";
import SelectField from "../../components/Reusable/SelectField";
import { WIDTHS, HEIGHTS, DIAMETERS } from "@/lib/tyre-sizes";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors, LIGHT_COLORS } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditTyreListing">;
type Colors = typeof LIGHT_COLORS;

const CONDITIONS = ["NEW", "USED", "REFURBISHED"] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITION_LABEL: Record<Condition, string> = {
  NEW: "New",
  USED: "Used",
  REFURBISHED: "Refurbished",
};

export default function AddEditTyreListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.listing as TyreListing | undefined;
  const { startSync } = useSyncStore();

  const existingPhotos: string[] = (() => {
    try { return existing ? (JSON.parse(existing.photos) as string[]) : []; } catch { return []; }
  })();

  const [width, setWidth] = useState(existing ? String(existing.width) : "");
  const [height, setHeight] = useState(existing ? String(existing.height) : "");
  const [diameter, setDiameter] = useState(existing ? String(existing.diameter) : "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [condition, setCondition] = useState<Condition>((existing?.condition as Condition) ?? "NEW");
  const [price, setPrice] = useState(existing ? String(existing.price_ghs) : "");
  const [inStock, setInStock] = useState(existing ? existing.in_stock === 1 : true);
  const [photos, setPhotos] = useState<string[]>(existingPhotos);
  const [localUris, setLocalUris] = useState<string[]>(existingPhotos);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogBrand[]>([]);

  useEffect(() => {
    void (async () => {
      await initDb();
      setCatalog(await getCachedTyreCatalog());
    })();
  }, []);

  const brandNames = catalog.map((b) => b.brandName);
  const modelsForBrand =
    catalog.find((b) => b.brandName === brand)?.models.map((m) => m.name) ?? [];

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
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    const d = parseInt(diameter, 10);
    if (!w || w <= 0) { Alert.alert("Please enter a valid tyre width (e.g. 205)"); return; }
    if (!h || h <= 0) { Alert.alert("Please enter a valid tyre height (e.g. 55)"); return; }
    if (!d || d <= 0) { Alert.alert("Please enter a valid rim diameter (e.g. 16)"); return; }
    if (!brand.trim()) { Alert.alert("Please enter the brand name"); return; }
    if (!model.trim()) { Alert.alert("Please enter the model name"); return; }
    const priceGhs = parseInt(price, 10);
    if (!priceGhs || priceGhs <= 0) { Alert.alert("Please enter a valid price"); return; }
    if (uploading) { Alert.alert("Please wait", "Photo is still uploading"); return; }

    setSaving(true);
    try {
      await initDb();
      const now = new Date().toISOString();
      const listingId = existing?.id ?? `local-${Date.now()}`;

      const listing: TyreListing = {
        id: listingId,
        server_id: existing?.server_id ?? null,
        width: w,
        height: h,
        diameter: d,
        brand: brand.trim(),
        model: model.trim(),
        condition,
        price_ghs: priceGhs,
        photos: JSON.stringify(photos.filter(Boolean)),
        in_stock: inStock ? 1 : 0,
        updated_at: now,
      };

      const op = existing ? "update" : "create";
      await enqueueTyreListing({
        id: `${op}-${listingId}-${Date.now()}`,
        op,
        listing_id: listingId,
        payload: JSON.stringify({
          server_id: existing?.server_id ?? null,
          width: w,
          height: h,
          diameter: d,
          brand: brand.trim(),
          model: model.trim(),
          condition,
          priceGhs,
          photos: photos.filter(Boolean),
          inStock,
        }),
        synced: 0,
        error: null,
        created_at: now,
      });

      await upsertTyreListing(listing);

      // Fire-and-forget — sync flushes the queue when online
      void startSync();

      nav.goBack();
    } catch (e: unknown) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.offwhite }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Size selectors */}
      <View style={styles.sizeRow}>
        <View style={[styles.sizeField, { flex: 1 }]}>
          <SelectField
            label="Width (mm) *"
            value={width}
            onChange={setWidth}
            options={WIDTHS.map(String)}
            placeholder="205"
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.sizeField, { flex: 1 }]}>
          <SelectField
            label="Height (%) *"
            value={height}
            onChange={setHeight}
            options={HEIGHTS.map(String)}
            placeholder="55"
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.sizeField, { flex: 1 }]}>
          <SelectField
            label={'Rim (") *'}
            value={diameter}
            onChange={setDiameter}
            options={DIAMETERS.map(String)}
            placeholder="16"
            keyboardType="number-pad"
          />
        </View>
      </View>

      <SelectField
        label="Brand *"
        value={brand}
        onChange={(v) => { setBrand(v); setModel(""); }}
        options={brandNames}
        placeholder="Select brand"
      />

      <SelectField
        label="Model *"
        value={model}
        onChange={setModel}
        options={modelsForBrand}
        placeholder="Select model"
      />

      <Field label="Condition" C={C}>
        <View style={styles.conditionRow}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.conditionBtn,
                { borderColor: C.gray, backgroundColor: C.white },
                condition === c && { backgroundColor: C.primary, borderColor: C.primary },
              ]}
              onPress={() => setCondition(c)}
            >
              <ReusableText
                text={CONDITION_LABEL[c]}
                family="medium"
                size={13}
                color={condition === c ? C.white : C.gray2}
              />
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field label="Price (GHS) *" C={C}>
        <TextInput
          style={[styles.input, { backgroundColor: C.white, borderColor: C.gray, color: C.secondary }]}
          value={price}
          onChangeText={setPrice}
          keyboardType="number-pad"
          placeholder="e.g. 850"
          placeholderTextColor={C.gray2}
        />
      </Field>

      <Field label={`Photos (${localUris.length}/4)`} C={C}>
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
                <Ionicons name="close-circle" size={20} color={C.red} />
              </TouchableOpacity>
            </View>
          ))}
          {localUris.length < 4 && (
            <TouchableOpacity
              style={[styles.addPhoto, { borderColor: C.primary, backgroundColor: C.primary1 }]}
              onPress={() => void pickPhoto()}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Ionicons name="camera-outline" size={28} color={C.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </Field>

      <TouchableOpacity
        style={[styles.stockToggle, inStock ? styles.stockIn : styles.stockOut]}
        onPress={() => setInStock((v) => !v)}
      >
        <Ionicons name={inStock ? "checkmark-circle" : "close-circle"} size={20} color={inStock ? "#16a34a" : C.red} />
        <ReusableText
          text={`${inStock ? "In Stock" : "Out of Stock"} — tap to toggle`}
          family="medium"
          size={14}
          color={inStock ? "#16a34a" : C.red}
        />
      </TouchableOpacity>

      <HeightSpacer height={4} />
      <ReusableBtn
        onPress={() => void save()}
        btnText={saving ? "Saving…" : uploading ? "Uploading photo…" : existing ? "Save Changes" : "Add Tyre Listing"}
        backgroundColor={saving || uploading ? C.gray2 : C.primary}
        textColor={C.white}
        width="100%"
        height={52}
        borderRadius={12}
        fontSize={SIZES.medium}
      />
    </ScrollView>
  );
}

function Field({ label, children, C }: { label: string; children: React.ReactNode; C: Colors }) {
  return (
    <View style={styles.field}>
      <ReusableText text={label} family="bold" size={SIZES.xSmall} color={C.primary} />
      <HeightSpacer height={6} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 16 },
  sizeRow: { flexDirection: "row", gap: 8 },
  sizeField: {},
  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    fontFamily: "regular",
  },
  conditionRow: { flexDirection: "row", gap: 8 },
  conditionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrapper: { position: "relative" },
  photo: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: { position: "absolute", top: -6, right: -6 },
  addPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
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
