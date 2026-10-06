import React, { useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { PART_CATEGORIES } from "@/lib/parts-catalog";
import { buildPartName } from "@/lib/part-tiles";
import { errorMessage, productsApi, specialtyRequestsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { useMakes, useModels, useVariants, YEARS } from "@/hooks/useVehicleTaxonomy";
import {
  ReusableBtn, ReusableText, HeightSpacer, FormField, FormInput, SelectButton, SegmentedButtons, StockToggle, PhotoGrid, PickerModal,
} from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditPartListing">;

const SIDES = ["Left", "Right", "Both"] as const;
type Side = (typeof SIDES)[number];
const POSITIONS = ["Front", "Rear"] as const;
type Position = (typeof POSITIONS)[number];
const CONDITIONS = ["NEW", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];
const CONDITION_LABEL: Record<Condition, string> = { NEW: "Brand New", USED: "Home Used" };
const MAX_PHOTOS = 4;

type CategoryConfig = { allTypes: string[]; hasSide: boolean; hasPosition: boolean };

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

type Picker = "make" | "model" | "year" | "engine" | "type" | null;

/**
 * Create a generic part, or edit an existing one (price, condition, photos,
 * stock). The structured fields are baked into the name on create, so in
 * edit mode the name is shown read-only rather than lossily re-parsed.
 */
export default function AddEditPartListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const { category, product } = route.params;
  const editing = !!product;
  const vendor = useAuthStore((s) => s.vendor);
  const setVendor = useAuthStore((s) => s.setVendor);
  const config: CategoryConfig = CATEGORY_CONFIG[category] ?? { allTypes: [], hasSide: false, hasPosition: false };

  // Quick chips = the vendor's approved specialties in this category.
  const categorySet = useMemo(() => new Set(config.allTypes), [config.allTypes]);
  const specialtyChips = (vendor?.specialties ?? []).filter((s) => categorySet.has(s));
  const pendingChips = (vendor?.pendingSpecialties ?? []).filter((s) => categorySet.has(s));

  const [partType, setPartType] = useState("");
  const [side, setSide] = useState<Side | "">("");
  const [position, setPosition] = useState<Position | "">("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engineCapacity, setEngineCapacity] = useState(product?.engineCapacity ?? "");
  const [condition, setCondition] = useState<Condition>(product?.condition === "USED" ? "USED" : "NEW");
  const [price, setPrice] = useState(product ? String(product.priceGhs) : "");
  const [inStock, setInStock] = useState(product?.inStock ?? true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const photos = usePhotoUpload({ max: MAX_PHOTOS, allowDeferred: false, initial: product?.photos ?? [] });

  const { makes, loading: makesLoading } = useMakes(vendor?.brands);
  const { models, loading: modelsLoading } = useModels(make);
  const { variants, loading: variantsLoading } = useVariants(make, model, year, category === "Engine");

  // "Request more" — ask admin to approve extra specialties.
  const [showRequest, setShowRequest] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  const [requestSelected, setRequestSelected] = useState<Set<string>>(new Set());
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const alreadyHave = new Set([...specialtyChips, ...pendingChips]);
  const requestable = config.allTypes.filter((t) => !alreadyHave.has(t));
  const filteredRequestable = requestSearch.trim() ? requestable.filter((t) => t.toLowerCase().includes(requestSearch.toLowerCase())) : requestable;

  const isCustomType = partType !== "" && !specialtyChips.includes(partType);

  async function submitSpecialtyRequest(): Promise<void> {
    if (requestSelected.size === 0) return;
    setSubmittingRequest(true);
    try {
      await specialtyRequestsApi.submit(Array.from(requestSelected), category);
      if (vendor) setVendor({ ...vendor, pendingSpecialties: [...vendor.pendingSpecialties, ...Array.from(requestSelected)] });
      setRequestSelected(new Set());
      setShowRequest(false);
      Alert.alert("Sent to admin", "The parts will appear as quick chips once approved.");
    } catch (e) {
      Alert.alert("Couldn't send", errorMessage(e));
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function save(): Promise<void> {
    const priceGhs = parseInt(price, 10);
    if (!editing) {
      if (!partType.trim()) { Alert.alert("Part type", "Select the part type."); return; }
      if (config.hasSide && !side) { Alert.alert("Side", "Select Left, Right or Both."); return; }
      if (config.hasPosition && !position) { Alert.alert("Position", "Select Front or Rear."); return; }
    }
    if (!(priceGhs > 0)) { Alert.alert("Price", "Enter a valid price in GHS."); return; }
    if (photos.uploading) { Alert.alert("Please wait", "A photo is still uploading."); return; }

    setSaving(true);
    try {
      if (editing) {
        await productsApi.update(product.id, { priceGhs, condition, photos: photos.urls, inStock, ...(engineCapacity ? { engineCapacity } : {}) });
      } else {
        const name = buildPartName({ type: partType, side: config.hasSide ? side : "", position: config.hasPosition ? position : "", make, model, year, engine: engineCapacity });
        await productsApi.create({ name, priceGhs, condition, photos: photos.urls, inStock, category, ...(engineCapacity ? { engineCapacity } : {}) });
      }
      nav.goBack();
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e, "Saving a part needs an internet connection."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: C.offwhite }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? (
          <FormField label="Part" hint="To change the part type or fitment, delete this listing and add it again.">
            <View style={[styles.readonly, { backgroundColor: C.white, borderColor: C.gray }]}>
              <ReusableText text={product.name} family="medium" size={SIZES.medium} color={C.secondary} />
            </View>
          </FormField>
        ) : (
          <>
            <FormField label="Part type *">
              <View style={styles.chipGrid}>
                {specialtyChips.map((t) => {
                  const active = partType === t;
                  return (
                    <TouchableOpacity key={t} style={[styles.chip, { borderColor: C.gray, backgroundColor: C.white }, active && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setPartType(t)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <ReusableText text={t} family="medium" size={12} color={active ? C.white : C.secondary} />
                    </TouchableOpacity>
                  );
                })}
                {pendingChips.map((t) => (
                  <View key={`pending-${t}`} style={[styles.chip, styles.chipPending, { borderColor: C.gray }]}>
                    <Ionicons name="time-outline" size={11} color={C.gray2} style={{ marginRight: 3 }} />
                    <ReusableText text={t} family="medium" size={12} color={C.gray2} numberOfLines={1} />
                  </View>
                ))}
                {config.allTypes.length > 0 && (
                  <>
                    <TouchableOpacity style={[styles.chip, { borderColor: C.primary, backgroundColor: isCustomType ? C.primary : C.primary1 }]} onPress={() => setPicker("type")} accessibilityRole="button">
                      <ReusableText text={isCustomType ? partType : "Other →"} family="medium" size={12} color={isCustomType ? C.white : C.primary} numberOfLines={1} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { borderColor: C.gray2, borderStyle: "dashed", backgroundColor: "transparent" }]} onPress={() => setShowRequest(true)} accessibilityRole="button">
                      <Ionicons name="add" size={13} color={C.gray2} />
                      <ReusableText text="Request" family="medium" size={12} color={C.gray2} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </FormField>

            {config.hasSide && (
              <FormField label="Side *"><SegmentedButtons options={SIDES} value={side} onChange={setSide} /></FormField>
            )}
            {config.hasPosition && (
              <FormField label="Position *"><SegmentedButtons options={POSITIONS} value={position} onChange={setPosition} /></FormField>
            )}

            <FormField label="Make (optional)">
              <SelectButton value={make} placeholder="Select make" onPress={() => setPicker("make")} loading={makesLoading} />
            </FormField>
            <View style={styles.twoRow}>
              <View style={{ flex: 1 }}>
                <FormField label="Model">
                  <SelectButton value={model} placeholder={make ? "Select model" : "Pick make first"} onPress={() => setPicker("model")} loading={modelsLoading} disabled={!make} />
                </FormField>
              </View>
              <View style={{ width: 8 }} />
              <View style={{ flex: 1 }}>
                <FormField label="Year">
                  <SelectButton value={year} placeholder="Select year" onPress={() => setPicker("year")} />
                </FormField>
              </View>
            </View>

            {category === "Engine" && make && model && year ? (
              <FormField label="Engine capacity (optional)">
                <SelectButton
                  value={engineCapacity}
                  placeholder={variantsLoading ? "Loading…" : variants.length === 0 ? "No variants found" : "Select engine"}
                  onPress={() => { if (variants.length > 0) setPicker("engine"); }}
                  loading={variantsLoading}
                />
              </FormField>
            ) : null}
          </>
        )}

        <FormField label="Condition">
          <SegmentedButtons options={CONDITIONS} value={condition} onChange={setCondition} labels={CONDITION_LABEL} />
        </FormField>

        <FormField label="Price (GHS) *">
          <FormInput value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 350" />
        </FormField>

        <FormField label={`Photos (${photos.photos.length}/${MAX_PHOTOS})`}>
          <PhotoGrid photos={photos.photos} canAddMore={photos.canAddMore} onAdd={() => void photos.capture()} onRemove={photos.remove} />
        </FormField>

        <StockToggle inStock={inStock} onToggle={() => setInStock((v) => !v)} />

        <ReusableBtn
          onPress={() => void save()}
          btnText={saving ? "Saving…" : photos.uploading ? "Uploading photo…" : editing ? "Save changes" : "Add part"}
          backgroundColor={saving || photos.uploading ? C.gray2 : C.primary}
          textColor={C.white}
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
          disabled={saving || photos.uploading}
        />
      </ScrollView>

      <PickerModal visible={picker === "make"} title="Select make" items={makes} selected={make} onSelect={(v) => { setMake(v); setModel(""); setEngineCapacity(""); setPicker(null); }} onClose={() => setPicker(null)} />
      <PickerModal visible={picker === "model"} title="Select model" items={models} selected={model} onSelect={(v) => { setModel(v); setEngineCapacity(""); setPicker(null); }} onClose={() => setPicker(null)} emptyText={modelsLoading ? "Loading…" : "No models found"} />
      <PickerModal visible={picker === "year"} title="Select year" items={YEARS} selected={year} onSelect={(v) => { setYear(v); setEngineCapacity(""); setPicker(null); }} onClose={() => setPicker(null)} />
      <PickerModal visible={picker === "engine"} title="Select engine" items={variants} selected={engineCapacity} onSelect={(v) => { setEngineCapacity(v); setPicker(null); }} onClose={() => setPicker(null)} />
      <PickerModal visible={picker === "type"} title={`All ${category} types`} items={config.allTypes} selected={partType} onSelect={(v) => { setPartType(v); setPicker(null); }} onClose={() => setPicker(null)} searchThreshold={0} />

      <Modal visible={showRequest} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowRequest(false)}>
        <SafeAreaView edges={["top", "bottom"]} style={[styles.modal, { backgroundColor: C.white }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.gray }]}>
            <ReusableText text="Request specialties" family="bold" size={18} color={C.secondary} />
            <TouchableOpacity onPress={() => { setShowRequest(false); setRequestSearch(""); setRequestSelected(new Set()); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={C.secondary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.note, { backgroundColor: C.offwhite }]}>
            <Ionicons name="information-circle-outline" size={16} color={C.gray2} />
            <ReusableText text="Pick the parts you sell. Admin reviews them and they appear as quick chips once approved." family="regular" size={13} color={C.gray2} />
          </View>
          <View style={[styles.searchWrap, { backgroundColor: C.offwhite }]}>
            <Ionicons name="search-outline" size={16} color={C.gray2} />
            <TextInput style={[styles.searchInput, { color: C.secondary }]} value={requestSearch} onChangeText={setRequestSearch} placeholder={`Search ${category.toLowerCase()} types…`} placeholderTextColor={C.gray2} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {filteredRequestable.map((t) => {
              const checked = requestSelected.has(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.modalItem, { borderBottomColor: C.gray }, checked && { backgroundColor: C.primary1 }]}
                  onPress={() => setRequestSelected((prev) => { const next = new Set(prev); if (checked) next.delete(t); else next.add(t); return next; })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                >
                  <ReusableText text={t} family="regular" size={SIZES.medium} color={checked ? C.primary : C.secondary} />
                  <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? C.primary : C.gray2} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {requestSelected.size > 0 && (
            <View style={[styles.modalFooter, { backgroundColor: C.white, borderTopColor: C.gray }]}>
              <ReusableBtn
                onPress={() => void submitSpecialtyRequest()}
                btnText={submittingRequest ? "Sending…" : `Request ${requestSelected.size} part${requestSelected.size > 1 ? "s" : ""}`}
                backgroundColor={submittingRequest ? C.gray2 : C.primary}
                textColor={C.white}
                height={48}
                disabled={submittingRequest}
              />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  twoRow: { flexDirection: "row", alignItems: "flex-start" },
  readonly: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 3 },
  chipPending: { opacity: 0.55 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 8, padding: 10 },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontFamily: "regular", fontSize: SIZES.medium, padding: 0 },
  modalItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalFooter: { padding: 16, borderTopWidth: 1 },
});
