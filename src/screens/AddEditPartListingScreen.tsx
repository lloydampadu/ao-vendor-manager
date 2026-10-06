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
import { PART_CATEGORIES } from "@/lib/parts-catalog";
import { vehicleApi, api, specialtyRequestsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { ReusableBtn, ReusableText, HeightSpacer } from "../../components";
import { SIZES, useThemeColors, LIGHT_COLORS } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditPartListing">;
type Colors = typeof LIGHT_COLORS;

const SIDES = ["Left", "Right", "Both"] as const;
type Side = (typeof SIDES)[number] | "";

const POSITIONS = ["Front", "Rear"] as const;
type Position = (typeof POSITIONS)[number] | "";

const CONDITIONS = ["NEW", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITION_LABEL: Record<Condition, string> = {
  NEW: "Brand New",
  USED: "Used",
};

const CURRENT_YEAR = 2026;
const YEARS = Array.from({ length: CURRENT_YEAR - 1980 + 1 }, (_, i) => String(CURRENT_YEAR - i));

const ENGINE_CAPACITIES = [
  "0.8L", "1.0L", "1.2L", "1.3L", "1.4L", "1.5L", "1.6L", "1.8L",
  "2.0L", "2.2L", "2.4L", "2.5L", "2.7L", "3.0L", "3.2L", "3.5L",
  "4.0L", "4.5L", "5.0L", "5.5L", "6.0L+",
];

type CategoryConfig = {
  allTypes: string[];
  hasSide: boolean;
  hasPosition: boolean;
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "Body":                  { allTypes: PART_CATEGORIES["Body"] ?? [],                  hasSide: true,  hasPosition: true  },
  "Axle & Brakes":         { allTypes: PART_CATEGORIES["Axle & Brakes"] ?? [],         hasSide: true,  hasPosition: true  },
  "Glass":                 { allTypes: PART_CATEGORIES["Glass"] ?? [],                 hasSide: true,  hasPosition: false },
  "Steering & Suspension": { allTypes: PART_CATEGORIES["Steering & Suspension"] ?? [], hasSide: true,  hasPosition: true  },
  "Electrical":            { allTypes: PART_CATEGORIES["Electrical"] ?? [],            hasSide: false, hasPosition: false },
  "Engine":                { allTypes: PART_CATEGORIES["Engine"] ?? [],                hasSide: false, hasPosition: false },
  "Transmission":          { allTypes: PART_CATEGORIES["Transmission"] ?? [],          hasSide: false, hasPosition: false },
  "Interior":              { allTypes: PART_CATEGORIES["Interior"] ?? [],              hasSide: false, hasPosition: false },
  "Heating & Cooling":     { allTypes: PART_CATEGORIES["Heating & Cooling"] ?? [],     hasSide: false, hasPosition: false },
  "Air & Fuel":            { allTypes: PART_CATEGORIES["Air & Fuel"] ?? [],            hasSide: false, hasPosition: false },
};

export default function AddEditPartListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const category = route.params.category;
  const vendor = useAuthStore((s) => s.vendor);
  const setVendor = useAuthStore((s) => s.setVendor);
  const config: CategoryConfig = CATEGORY_CONFIG[category] ?? {
    allTypes: [],
    hasSide: false,
    hasPosition: false,
  };

  // Chips = vendor's own specialties that belong to this category (set by admin).
  const categorySet = new Set(config.allTypes);
  const specialtyChips = (vendor?.specialties ?? []).filter((s) => categorySet.has(s));

  const [partType, setPartType] = useState("");
  const [side, setSide] = useState<Side>("");
  const [position, setPosition] = useState<Position>("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [condition, setCondition] = useState<Condition>("NEW");
  const [price, setPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [localUris, setLocalUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const [fullListSearch, setFullListSearch] = useState("");

  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [makesLoading, setMakesLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showMakePicker, setShowMakePicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [engineCapacity, setEngineCapacity] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [showCapacityPicker, setShowCapacityPicker] = useState(false);

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

  useEffect(() => {
    if (category !== "Engine" || !make || !model || !year) { setVariants([]); setEngineCapacity(""); return; }
    setVariantsLoading(true);
    vehicleApi.getVariants(make, model, year)
      .then((res) => setVariants(res.variants))
      .catch(() => setVariants([]))
      .finally(() => setVariantsLoading(false));
  }, [category, make, model, year]);

  const isCustomType = partType !== "" && !specialtyChips.includes(partType);
  const filteredFullList = fullListSearch.trim()
    ? config.allTypes.filter((t) => t.toLowerCase().includes(fullListSearch.toLowerCase()))
    : config.allTypes;

  const pendingChips = (vendor?.pendingSpecialties ?? []).filter((s) => categorySet.has(s));

  // Request-more modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  const [requestSelected, setRequestSelected] = useState<Set<string>>(new Set());
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const alreadyHave = new Set([...specialtyChips, ...pendingChips]);
  const requestableTypes = config.allTypes.filter((t) => !alreadyHave.has(t));
  const filteredRequestList = requestSearch.trim()
    ? requestableTypes.filter((t) => t.toLowerCase().includes(requestSearch.toLowerCase()))
    : requestableTypes;

  async function submitSpecialtyRequest(): Promise<void> {
    if (requestSelected.size === 0) return;
    setSubmittingRequest(true);
    try {
      await specialtyRequestsApi.submit(Array.from(requestSelected), category);
      // Optimistically add to pendingSpecialties so chips appear immediately
      if (vendor) {
        const newPending = [...(vendor.pendingSpecialties ?? []), ...Array.from(requestSelected)];
        setVendor({ ...vendor, pendingSpecialties: newPending });
      }
      setRequestSelected(new Set());
      setShowRequestModal(false);
      Alert.alert("Sent to admin", "Your request has been sent. The parts will appear here once approved.");
    } catch {
      Alert.alert("Couldn't send", "Check your connection and try again.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function pickPhoto(): Promise<void> {
    if (photos.length >= 4) { Alert.alert("You can only add 4 photos"); return; }
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
    if (!partType.trim()) { Alert.alert("Please select the part type"); return; }
    if (config.hasSide && !side) { Alert.alert("Please select a side (Left, Right, or Both)"); return; }
    if (config.hasPosition && !position) { Alert.alert("Please select a position (Front or Rear)"); return; }
    const priceGhs = parseInt(price, 10);
    if (!priceGhs || priceGhs <= 0) { Alert.alert("Please enter a valid price"); return; }
    if (uploading) { Alert.alert("Please wait", "Photo is still uploading"); return; }

    // Build a descriptive name from structured inputs
    const parts: string[] = [partType.trim()];
    if (config.hasSide && side) parts.push(side);
    if (config.hasPosition && position) parts.push(position);
    if (make) {
      const fitment = [make, model, year].filter(Boolean).join(" ");
      parts.push(fitment);
    }
    if (engineCapacity) parts.push(engineCapacity);
    const name = parts.join(" — ");

    setSaving(true);
    try {
      await api.post("/vendor/products", {
        name,
        priceGhs,
        condition,
        photos: photos.filter(Boolean),
        inStock,
        ...(engineCapacity ? { engineCapacity } : {}),
      });
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
        {/* Part type chips */}
        <Field label="Part Type *" C={C}>
          <View style={styles.chipGrid}>
            {/* Approved specialty chips */}
            {specialtyChips.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.chip,
                  { borderColor: C.gray, backgroundColor: C.white },
                  partType === t && { backgroundColor: C.primary, borderColor: C.primary },
                ]}
                onPress={() => setPartType(t)}
              >
                <ReusableText text={t} family="medium" size={12} color={partType === t ? C.white : C.secondary} />
              </TouchableOpacity>
            ))}

            {/* Pending specialty chips — disabled, with clock indicator */}
            {pendingChips.map((t) => (
              <View
                key={`pending-${t}`}
                style={[styles.chip, styles.chipPending, { borderColor: C.gray }]}
              >
                <Ionicons name="time-outline" size={11} color={C.gray2} style={{ marginRight: 3 }} />
                <ReusableText text={t} family="medium" size={12} color={C.gray2} numberOfLines={1} />
              </View>
            ))}

            {/* Other → selects a one-off type for this listing */}
            {config.allTypes.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  { borderColor: C.primary, backgroundColor: C.primary1 },
                  isCustomType && { backgroundColor: C.primary, borderColor: C.primary },
                ]}
                onPress={() => setShowFullList(true)}
              >
                <ReusableText
                  text={isCustomType ? partType : "Other →"}
                  family="medium"
                  size={12}
                  color={isCustomType ? C.white : C.primary}
                  numberOfLines={1}
                />
              </TouchableOpacity>
            )}

            {/* + Request more — adds to pending list, admin approves */}
            {config.allTypes.length > 0 && (
              <TouchableOpacity
                style={[styles.chip, { borderColor: C.gray2, borderStyle: "dashed", backgroundColor: "transparent" }]}
                onPress={() => setShowRequestModal(true)}
              >
                <Ionicons name="add" size={13} color={C.gray2} />
                <ReusableText text="Request" family="medium" size={12} color={C.gray2} />
              </TouchableOpacity>
            )}
          </View>
        </Field>

        {/* Side — only for categories that need it */}
        {config.hasSide && (
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
                  <ReusableText text={s} family="medium" size={13} color={side === s ? C.white : C.gray2} />
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}

        {/* Position — only for categories that need it */}
        {config.hasPosition && (
          <Field label="Position" C={C}>
            <View style={styles.conditionRow}>
              {POSITIONS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.conditionBtn,
                    { borderColor: C.gray, backgroundColor: C.white },
                    position === p && { backgroundColor: C.primary, borderColor: C.primary },
                  ]}
                  onPress={() => setPosition(p)}
                >
                  <ReusableText text={p} family="medium" size={13} color={position === p ? C.white : C.gray2} />
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}

        {/* Vehicle fitment — optional */}
        <Field label="Make (optional)" C={C}>
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

        {/* Engine capacity — only for Engine category, loaded from vehicle variants */}
        {category === "Engine" && make && model && year && (
          <Field label="Engine Capacity (optional)" C={C}>
            <TouchableOpacity
              style={[styles.select, { backgroundColor: C.white, borderColor: C.gray }]}
              onPress={() => { if (variants.length > 0) setShowCapacityPicker(true); }}
            >
              <ReusableText
                text={engineCapacity || (variantsLoading ? "Loading…" : variants.length === 0 ? "No variants found" : "Select engine")}
                family="regular"
                size={SIZES.medium}
                color={engineCapacity ? C.secondary : C.gray2}
              />
              {variantsLoading
                ? <ActivityIndicator size="small" color={C.gray2} />
                : <Ionicons name="chevron-down" size={16} color={C.gray2} />
              }
            </TouchableOpacity>
          </Field>
        )}

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
                {uploading
                  ? <ActivityIndicator color={C.primary} />
                  : <Ionicons name="camera-outline" size={28} color={C.primary} />
                }
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
          btnText={saving ? "Saving…" : uploading ? "Uploading photo…" : "Add Part"}
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
        onSelect={(v) => { setMake(v); setModel(""); setYear(""); setEngineCapacity(""); setShowMakePicker(false); }}
        onClose={() => setShowMakePicker(false)}
        C={C}
      />

      {/* Model picker */}
      <PickerModal
        visible={showModelPicker}
        title="Select Model"
        items={models}
        selected={model}
        onSelect={(v) => { setModel(v); setEngineCapacity(""); setShowModelPicker(false); }}
        onClose={() => setShowModelPicker(false)}
        C={C}
      />

      {/* Year picker */}
      <PickerModal
        visible={showYearPicker}
        title="Select Year"
        items={YEARS}
        selected={year}
        onSelect={(v) => { setYear(v); setEngineCapacity(""); setShowYearPicker(false); }}
        onClose={() => setShowYearPicker(false)}
        C={C}
      />

      {/* Engine capacity picker — variants from taxonomy */}
      <PickerModal
        visible={showCapacityPicker}
        title="Select Engine"
        items={variants}
        selected={engineCapacity}
        onSelect={(v) => { setEngineCapacity(v); setShowCapacityPicker(false); }}
        onClose={() => setShowCapacityPicker(false)}
        C={C}
      />

      {/* Request specialty modal — multi-select, sends to admin for approval */}
      <Modal visible={showRequestModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRequestModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: C.white }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.gray }]}>
            <ReusableText text="Request Specialties" family="bold" size={18} color={C.secondary} />
            <TouchableOpacity onPress={() => { setShowRequestModal(false); setRequestSearch(""); setRequestSelected(new Set()); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={C.secondary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.requestNote, { backgroundColor: C.offwhite }]}>
            <Ionicons name="information-circle-outline" size={16} color={C.gray2} />
            <ReusableText text="Select the parts you sell. Admin will review and approve them to appear as your quick chips." family="regular" size={13} color={C.gray2} />
          </View>
          <View style={[styles.searchWrap, { backgroundColor: C.offwhite }]}>
            <Ionicons name="search-outline" size={16} color={C.gray2} />
            <TextInput
              style={[styles.searchInput, { color: C.secondary }]}
              value={requestSearch}
              onChangeText={setRequestSearch}
              placeholder={`Search ${category.toLowerCase()} types…`}
              placeholderTextColor={C.gray2}
            />
          </View>
          <ScrollView contentContainerStyle={styles.modalList} keyboardShouldPersistTaps="handled">
            {filteredRequestList.map((t) => {
              const checked = requestSelected.has(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.modalItem, { borderBottomColor: C.gray }, checked && { backgroundColor: C.primary1 }]}
                  onPress={() => setRequestSelected((prev) => {
                    const next = new Set(prev);
                    checked ? next.delete(t) : next.add(t);
                    return next;
                  })}
                >
                  <ReusableText text={t} family="regular" size={SIZES.medium} color={checked ? C.primary : C.secondary} />
                  <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? C.primary : C.gray2} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {requestSelected.size > 0 && (
            <View style={[styles.requestFooter, { backgroundColor: C.white, borderTopColor: C.gray }]}>
              <TouchableOpacity
                style={[styles.requestBtn, { backgroundColor: submittingRequest ? C.gray2 : C.primary }]}
                onPress={() => void submitSpecialtyRequest()}
                disabled={submittingRequest}
              >
                <ReusableText
                  text={submittingRequest ? "Sending…" : `Request ${requestSelected.size} part${requestSelected.size > 1 ? "s" : ""}`}
                  family="bold"
                  size={15}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Full part type list modal */}
      <Modal visible={showFullList} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: C.white }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.gray }]}>
            <ReusableText text={`All ${category} Types`} family="bold" size={18} color={C.secondary} />
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
              placeholder={`Search ${category.toLowerCase()} types…`}
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
                  partType === t && { backgroundColor: C.primary1 },
                ]}
                onPress={() => {
                  setPartType(t);
                  setShowFullList(false);
                  setFullListSearch("");
                }}
              >
                <ReusableText text={t} family="regular" size={SIZES.medium} color={partType === t ? C.primary : C.secondary} />
                {partType === t && <Ionicons name="checkmark" size={18} color={C.primary} />}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  chipPending: {
    opacity: 0.55,
  },

  requestNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 8,
    padding: 10,
  },
  requestFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  requestBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
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
