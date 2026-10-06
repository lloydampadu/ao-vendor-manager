import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { initDb, upsertLightListing, enqueueLightListing } from "@/lib/db";
import type { LightListing } from "@/lib/db";
import { PART_CATEGORIES } from "@/lib/parts-catalog";
import { vehicleApi } from "@/lib/api";
import { useSyncStore } from "@/store/sync-store";
import { useAuthStore } from "@/store/auth-store";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors, LIGHT_COLORS } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditLightListing">;
type Colors = typeof LIGHT_COLORS;

// 12 primary types shown as chips; the rest accessible via "Other →"
const PRIMARY_LIGHT_TYPES = [
  "Headlight Assembly",
  "Headlight Bulb",
  "Headlight Housing",
  "Headlight Lens",
  "Tail Light",
  "Tail Light Lens",
  "Fog Lamp",
  "Fog Lamp Rear",
  "Third Brake Light",
  "Turn Signal/Indicator",
  "Backup Light",
  "Dome Light",
] as const;

const ALL_LIGHT_TYPES: string[] = PART_CATEGORIES["Lamps"] ?? [];

const SIDES = ["Left", "Right", "Pair", "N/A"] as const;
type Side = (typeof SIDES)[number];

const CONDITIONS = ["NEW", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITION_LABEL: Record<Condition, string> = {
  NEW: "Brand New",
  USED: "Home Used",
};

const CURRENT_YEAR = 2026;
const YEARS = Array.from({ length: CURRENT_YEAR - 1980 + 1 }, (_, i) => String(CURRENT_YEAR - i));

export default function AddEditLightListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.listing as LightListing | undefined;
  const { startSync } = useSyncStore();
  const vendor = useAuthStore((s) => s.vendor);

  const existingPhotos: string[] = (() => {
    try { return existing ? (JSON.parse(existing.photos) as string[]) : []; } catch { return []; }
  })();

  const [lightType, setLightType] = useState(existing?.light_type ?? "");
  const [side, setSide] = useState<Side>((existing?.side as Side) ?? "N/A");
  const [make, setMake] = useState(existing?.make ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [year, setYear] = useState(existing?.year ?? "");
  const [condition, setCondition] = useState<Condition>((existing?.condition as Condition) ?? "NEW");
  const [price, setPrice] = useState(existing ? String(existing.price_ghs) : "");
  const [inStock, setInStock] = useState(existing ? existing.in_stock === 1 : true);
  const [photos, setPhotos] = useState<string[]>(existingPhotos);
  const [localUris, setLocalUris] = useState<string[]>(existingPhotos);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const [fullListSearch, setFullListSearch] = useState("");

  // Vehicle dropdowns
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [makesLoading, setMakesLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showMakePicker, setShowMakePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  useEffect(() => {
    const vendorBrands = vendor?.brands ?? [];
    setMakesLoading(true);
    vehicleApi.getMakes()
      .then((res) => {
        const all = res.makes;
        setMakes(
          vendorBrands.length > 0
            ? all.filter((m) => vendorBrands.some((b) => b.toLowerCase() === m.toLowerCase()))
            : all
        );
      })
      .catch(() => { /* offline */ })
      .finally(() => setMakesLoading(false));
  }, [vendor?.brands]);

  useEffect(() => {
    if (!make) { setModels([]); return; }
    setModelsLoading(true);
    vehicleApi.getModels(make)
      .then((res) => setModels(res.models))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [make]);

  const filteredFullList = fullListSearch.trim()
    ? ALL_LIGHT_TYPES.filter((t) => t.toLowerCase().includes(fullListSearch.toLowerCase()))
    : ALL_LIGHT_TYPES;

  async function pickPhoto(): Promise<void> {
    if (photos.length >= 4) {
      Alert.alert("You can only add 4 photos");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Camera needed", "Please allow camera access to add photos."); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    const localUri = result.assets[0].uri;
    setLocalUris((prev) => [...prev, localUri]);
    setUploading(true);
    try {
      const url = await uploadImage(localUri);
      setPhotos((prev) => [...prev, url]);
    } catch {
      setLocalUris((prev) => prev.filter((u) => u !== localUri));
      Alert.alert("Photo not uploaded", "The photo didn't go through. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save(): Promise<void> {
    if (!lightType.trim()) { Alert.alert("Please select the light type"); return; }
    const priceGhs = parseInt(price, 10);
    if (!priceGhs || priceGhs <= 0) { Alert.alert("Please enter a valid price"); return; }
    if (uploading) { Alert.alert("Please wait", "Photo is still uploading"); return; }
    if (photos.filter(Boolean).length === 0) { Alert.alert("Please add at least one photo of the light"); return; }

    setSaving(true);
    try {
      await initDb();
      const now = new Date().toISOString();
      const listingId = existing?.id ?? `local-${Date.now()}`;

      const listing: LightListing = {
        id: listingId,
        server_id: existing?.server_id ?? null,
        light_type: lightType.trim(),
        side,
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        condition,
        price_ghs: priceGhs,
        photos: JSON.stringify(photos.filter(Boolean)),
        in_stock: inStock ? 1 : 0,
        updated_at: now,
      };

      const op = existing ? "update" : "create";
      await enqueueLightListing({
        id: `${op}-${listingId}-${Date.now()}`,
        op,
        listing_id: listingId,
        payload: JSON.stringify({
          server_id: existing?.server_id ?? null,
          lightType: lightType.trim(),
          side,
          make: make.trim(),
          model: model.trim(),
          year: year.trim(),
          condition,
          priceGhs,
          photos: photos.filter(Boolean),
          inStock,
        }),
        synced: 0,
        error: null,
        created_at: now,
      });

      await upsertLightListing(listing);
      void startSync();
      nav.goBack();
    } catch {
      Alert.alert("Couldn't save", "Something went wrong on our end. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: C.offwhite }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Light type chips */}
        <Field label="Light Type *" C={C}>
          <View style={styles.chipGrid}>
            {PRIMARY_LIGHT_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.chip,
                  { borderColor: C.gray, backgroundColor: C.white },
                  lightType === t && { backgroundColor: C.primary, borderColor: C.primary },
                ]}
                onPress={() => setLightType(t)}
              >
                <ReusableText
                  text={t}
                  family="medium"
                  size={12}
                  color={lightType === t ? C.white : C.secondary}
                />
              </TouchableOpacity>
            ))}

            {/* Other → opens full list modal */}
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: C.primary, backgroundColor: C.primary1 },
                lightType !== "" && !PRIMARY_LIGHT_TYPES.includes(lightType as typeof PRIMARY_LIGHT_TYPES[number]) && { backgroundColor: C.primary, borderColor: C.primary },
              ]}
              onPress={() => setShowFullList(true)}
            >
              <ReusableText
                text={
                  lightType !== "" && !PRIMARY_LIGHT_TYPES.includes(lightType as typeof PRIMARY_LIGHT_TYPES[number])
                    ? lightType
                    : "Other →"
                }
                family="medium"
                size={12}
                color={
                  lightType !== "" && !PRIMARY_LIGHT_TYPES.includes(lightType as typeof PRIMARY_LIGHT_TYPES[number])
                    ? C.white
                    : C.primary
                }
                numberOfLines={1}
              />
            </TouchableOpacity>
          </View>
        </Field>

        {/* Side */}
        <Field label="Side" C={C}>
          <View style={styles.conditionRow}>
            {SIDES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.conditionBtn,
                  { borderColor: C.gray, backgroundColor: C.white },
                  side === s && { backgroundColor: C.primary, borderColor: C.primary },
                ]}
                onPress={() => setSide(s)}
              >
                <ReusableText
                  text={s}
                  family="medium"
                  size={13}
                  color={side === s ? C.white : C.gray2}
                />
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Vehicle make/model/year — dropdown selectors */}
        <Field label="Make" C={C}>
          <TouchableOpacity
            style={[styles.select, { backgroundColor: C.white, borderColor: C.gray }]}
            onPress={() => setShowMakePicker(true)}
          >
            <ReusableText
              text={make || "Select make"}
              family="regular"
              size={SIZES.medium}
              color={make ? C.secondary : C.gray2}
            />
            {makesLoading
              ? <ActivityIndicator size="small" color={C.gray2} />
              : <Ionicons name="chevron-down" size={16} color={C.gray2} />
            }
          </TouchableOpacity>
        </Field>

        <View style={styles.twoRow}>
          <View style={{ flex: 1 }}>
            <Field label="Model" C={C}>
              <TouchableOpacity
                style={[styles.select, { backgroundColor: make ? C.white : C.offwhite, borderColor: C.gray }]}
                onPress={() => { if (make) setShowModelPicker(true); }}
              >
                <ReusableText
                  text={model || (make ? "Select model" : "Pick make first")}
                  family="regular"
                  size={SIZES.medium}
                  color={model ? C.secondary : C.gray2}
                />
                {modelsLoading
                  ? <ActivityIndicator size="small" color={C.gray2} />
                  : <Ionicons name="chevron-down" size={16} color={C.gray2} />
                }
              </TouchableOpacity>
            </Field>
          </View>
          <View style={{ width: 8 }} />
          <View style={{ flex: 1 }}>
            <Field label="Year" C={C}>
              <TouchableOpacity
                style={[styles.select, { backgroundColor: C.white, borderColor: C.gray }]}
                onPress={() => setShowYearPicker(true)}
              >
                <ReusableText
                  text={year || "Select year"}
                  family="regular"
                  size={SIZES.medium}
                  color={year ? C.secondary : C.gray2}
                />
                <Ionicons name="chevron-down" size={16} color={C.gray2} />
              </TouchableOpacity>
            </Field>
          </View>
        </View>

        {/* Condition */}
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

        {/* Price */}
        <Field label="Price (GHS) *" C={C}>
          <TextInput
            style={[styles.input, { backgroundColor: C.white, borderColor: C.gray, color: C.secondary }]}
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            placeholder="e.g. 350"
            placeholderTextColor={C.gray2}
          />
        </Field>

        {/* Photos */}
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

        {/* In stock toggle */}
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
          btnText={saving ? "Saving…" : uploading ? "Uploading photo…" : existing ? "Save Changes" : "Add Light Listing"}
          backgroundColor={saving || uploading ? C.gray2 : C.primary}
          textColor={C.white}
          width="100%"
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
        />
      </ScrollView>

      {/* Make picker */}
      <PickerModal
        visible={showMakePicker}
        title="Select Make"
        items={makes}
        selected={make}
        onSelect={(v) => { setMake(v); setModel(""); setYear(""); setShowMakePicker(false); }}
        onClose={() => setShowMakePicker(false)}
        C={C}
      />

      {/* Model picker */}
      <PickerModal
        visible={showModelPicker}
        title="Select Model"
        items={models}
        selected={model}
        onSelect={(v) => { setModel(v); setShowModelPicker(false); }}
        onClose={() => setShowModelPicker(false)}
        C={C}
      />

      {/* Year picker */}
      <PickerModal
        visible={showYearPicker}
        title="Select Year"
        items={YEARS}
        selected={year}
        onSelect={(v) => { setYear(v); setShowYearPicker(false); }}
        onClose={() => setShowYearPicker(false)}
        C={C}
      />

      {/* Full light type list modal */}
      <Modal visible={showFullList} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: C.white }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.gray }]}>
            <ReusableText text="All Light Types" family="bold" size={18} color={C.secondary} />
            <TouchableOpacity onPress={() => setShowFullList(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={C.secondary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.searchWrap, { backgroundColor: C.offwhite }]}>
            <Ionicons name="search-outline" size={16} color={C.gray2} />
            <TextInput
              style={[styles.searchInput, { color: C.secondary }]}
              value={fullListSearch}
              onChangeText={setFullListSearch}
              placeholder="Search light types…"
              placeholderTextColor={C.gray2}
              autoFocus
            />
          </View>
          <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
            {filteredFullList.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.modalItem,
                  { borderBottomColor: C.gray },
                  lightType === t && { backgroundColor: C.primary1 },
                ]}
                onPress={() => {
                  setLightType(t);
                  setShowFullList(false);
                  setFullListSearch("");
                }}
              >
                <ReusableText text={t} family="regular" size={SIZES.medium} color={lightType === t ? C.primary : C.secondary} />
                {lightType === t && <Ionicons name="checkmark" size={18} color={C.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
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

function PickerModal({
  visible, title, items, selected, onSelect, onClose, C,
}: {
  visible: boolean;
  title: string;
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  C: Colors;
}): React.JSX.Element {
  const [search, setSearch] = React.useState("");
  const filtered = search.trim()
    ? items.filter((i) => i.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: C.white }]}>
        <View style={[styles.modalHeader, { borderBottomColor: C.gray }]}>
          <ReusableText text={title} family="bold" size={18} color={C.secondary} />
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={C.secondary} />
          </TouchableOpacity>
        </View>
        {items.length > 8 && (
          <View style={[styles.searchWrap, { backgroundColor: C.offwhite }]}>
            <Ionicons name="search-outline" size={16} color={C.gray2} />
            <TextInput
              style={[styles.searchInput, { color: C.secondary }]}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${title.toLowerCase()}…`}
              placeholderTextColor={C.gray2}
              autoFocus
            />
          </View>
        )}
        <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
          {filtered.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.modalItem, { borderBottomColor: C.gray }, selected === item && { backgroundColor: C.primary1 }]}
              onPress={() => { onSelect(item); setSearch(""); }}
            >
              <ReusableText text={item} family="regular" size={SIZES.medium} color={selected === item ? C.primary : C.secondary} />
              {selected === item && <Ionicons name="checkmark" size={18} color={C.primary} />}
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ReusableText text="No results" family="regular" size={SIZES.medium} color={C.gray2} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 16 },
  twoRow: { flexDirection: "row", alignItems: "flex-start" },

  select: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  conditionRow: { flexDirection: "row", gap: 8 },
  conditionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },

  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    fontFamily: "regular",
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

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "regular",
    fontSize: SIZES.medium,
  },
  modalList: { paddingBottom: 40 },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});
