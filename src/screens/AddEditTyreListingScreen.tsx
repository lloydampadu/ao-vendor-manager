import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { getCachedTyreCatalog, type TyreListing } from "@/lib/db";
import { tyreCatalogApi } from "@/lib/api";
import { brandsOf, catalogChoices, modelsOf, type CatalogChoice } from "@/lib/tyre-catalog";
import { newLocalId, saveTyreListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { WIDTHS, HEIGHTS, DIAMETERS } from "@/lib/tyre-sizes";
import { useSyncStore } from "@/store/sync-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import SelectField from "../../components/Reusable/SelectField";
import { ReusableBtn, HeightSpacer, FormField, FormInput, SegmentedButtons, StockToggle, PhotoGrid, ReusableText, SelectButton, PickerModal } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditTyreListing">;

const CONDITIONS = ["NEW", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];
const CONDITION_LABEL: Record<Condition, string> = { NEW: "Brand New", USED: "Home Used" };

// Vendors pick the kind of tyre rather than an exact product name; this maps to
// the customer-facing "Tyre type" categories and is stored in `model`.
const TYRE_TYPES = ["All-Season", "Performance", "Off-road", "Standard"];

const MAX_PHOTOS = 4;

// Only ask the server about sizes that could be real, so typing "2", "20", "205"
// into a size field doesn't fire three requests for nonsense sizes.
const plausibleSize = (w: number, h: number, d: number) =>
  w >= 100 && w <= 400 && h >= 20 && h <= 95 && d >= 10 && d <= 30;
const SIZE_DEBOUNCE_MS = 400;

type CatalogState = "idle" | "loading" | "ready" | "error";

export default function AddEditTyreListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.listing;
  const startSync = useSyncStore((s) => s.startSync);

  const [width, setWidth] = useState(existing ? String(existing.width) : "");
  const [height, setHeight] = useState(existing ? String(existing.height) : "");
  const [diameter, setDiameter] = useState(existing ? String(existing.diameter) : "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [condition, setCondition] = useState<Condition>(existing?.condition === "USED" ? "USED" : "NEW");
  const [price, setPrice] = useState(existing ? String(existing.price_ghs) : "");
  const [inStock, setInStock] = useState(existing ? existing.in_stock === 1 : true);
  const [saving, setSaving] = useState(false);
  const [brandNames, setBrandNames] = useState<string[]>([]);
  // Catalog link: the picked catalog size row, or null for a free-text listing.
  const [sizeId, setSizeId] = useState<string | null>(existing?.tyre_size_id ?? null);
  // "Not in the list": the vendor chose to type brand/model themselves. Old unlinked listings start here.
  const [manual, setManual] = useState(existing ? !existing.tyre_size_id : false);
  const [choices, setChoices] = useState<CatalogChoice[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("idle");
  const [picker, setPicker] = useState<"brand" | "model" | null>(null);
  const photos = usePhotoUpload({ max: MAX_PHOTOS, allowDeferred: true, initial: existing ? parseJson<string[]>(existing.photos, []) : [] });

  useEffect(() => {
    getCachedTyreCatalog()
      .then((catalog) => setBrandNames(catalog.map((b) => b.brandName).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))))
      .catch(() => setBrandNames([]));
  }, []);

  const wN = parseInt(width, 10), hN = parseInt(height, 10), dN = parseInt(diameter, 10);
  const sizeOk = plausibleSize(wN, hN, dN);

  useEffect(() => {
    if (!sizeOk) { setChoices([]); setCatalogState("idle"); return; }
    let cancelled = false;
    // Drop the previous size's tyres at once so none can be linked while the new size loads.
    setChoices([]);
    setCatalogState("loading");
    const timer = setTimeout(() => {
      tyreCatalogApi.modelsForSize(wN, hN, dN)
        .then((resp) => { if (!cancelled) { setChoices(catalogChoices(resp)); setCatalogState("ready"); } })
        .catch(() => { if (!cancelled) { setChoices([]); setCatalogState("error"); } });
    }, SIZE_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sizeOk, wN, hN, dN]);

  // Pickers while the catalog is on its way or has tyres for this size; otherwise
  // today's free-text fields, so a vendor is never blocked from posting.
  const catalogEmpty = catalogState === "error" || (catalogState === "ready" && choices.length === 0);
  const showPickers = !manual && !catalogEmpty;
  const brandItems = useMemo(() => brandsOf(choices), [choices]);
  const modelChoices = useMemo(() => modelsOf(choices, brand), [choices, brand]);

  // Changing the size invalidates a catalog pick (the model may not exist in the new size).
  function changeSize(setter: (v: string) => void): (v: string) => void {
    return (v) => {
      setter(v);
      if (sizeId !== null || showPickers) { setSizeId(null); setBrand(""); setModel(""); }
    };
  }

  function validate(): { w: number; h: number; d: number; priceGhs: number } | null {
    const w = parseInt(width, 10), h = parseInt(height, 10), d = parseInt(diameter, 10), priceGhs = parseInt(price, 10);
    if (!(w > 0)) { Alert.alert("Tyre width", "Enter a valid width, e.g. 205."); return null; }
    if (!(h > 0)) { Alert.alert("Tyre height", "Enter a valid height, e.g. 55."); return null; }
    if (!(d > 0)) { Alert.alert("Rim size", "Enter a valid rim diameter, e.g. 16."); return null; }
    if (!brand.trim()) { Alert.alert("Brand", "Choose or type the tyre brand."); return null; }
    if (!model.trim()) { Alert.alert(showPickers ? "Model" : "Tyre type", showPickers ? "Choose the tyre model." : "Choose the tyre type."); return null; }
    if (showPickers && !sizeId) { Alert.alert("Model", "Choose the tyre model from the list, or tap \"Not in the list\"."); return null; }
    if (!(priceGhs > 0)) { Alert.alert("Price", "Enter a valid price in GHS."); return null; }
    if (photos.uploading) { Alert.alert("Please wait", "A photo is still uploading."); return null; }
    if (photos.urls.length === 0) { Alert.alert("Photo needed", "Add at least one photo of the tyre."); return null; }
    return { w, h, d, priceGhs };
  }

  async function save(): Promise<void> {
    const v = validate();
    if (!v) return;
    setSaving(true);
    try {
      const row: TyreListing = {
        id: existing?.id ?? newLocalId(),
        server_id: existing?.server_id ?? null,
        width: v.w, height: v.h, diameter: v.d,
        brand: brand.trim(), model: model.trim(), condition,
        price_ghs: v.priceGhs,
        photos: JSON.stringify(photos.urls),
        in_stock: inStock ? 1 : 0,
        tyre_size_id: showPickers ? sizeId : null,
        // Advice describes the old price/state; keep it only if nothing it depends on changed.
        price_advice:
          existing && existing.price_ghs === v.priceGhs && existing.condition === condition
            && (existing.in_stock === 1) === inStock && (existing.tyre_size_id ?? null) === (showPickers ? sizeId : null)
            ? existing.price_advice : null,
        updated_at: new Date().toISOString(),
      };
      await saveTyreListing(row, !existing);
      void startSync();
      nav.goBack();
    } catch {
      Alert.alert("Couldn't save", "Something went wrong saving on this phone. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: C.offwhite }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.sizeRow}>
        <View style={{ flex: 1 }}><SelectField label="Width (mm) *" value={width} onChange={changeSize(setWidth)} options={WIDTHS.map(String)} placeholder="205" keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><SelectField label="Height (%) *" value={height} onChange={changeSize(setHeight)} options={HEIGHTS.map(String)} placeholder="55" keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><SelectField label={'Rim (") *'} value={diameter} onChange={changeSize(setDiameter)} options={DIAMETERS.map(String)} placeholder="16" keyboardType="number-pad" /></View>
      </View>

      {showPickers ? (
        <>
          <FormField label="Brand *">
            <SelectButton value={catalogState === "loading" ? "Loading…" : brand} placeholder={sizeOk ? "Select brand" : "Enter the size first"} onPress={() => setPicker("brand")} loading={catalogState === "loading"} disabled={!sizeOk || catalogState === "loading"} />
          </FormField>
          <FormField label="Model *">
            <SelectButton value={catalogState === "loading" ? "Loading…" : model} placeholder="Select model" onPress={() => setPicker("model")} disabled={!sizeOk || !brand || catalogState === "loading"} />
          </FormField>
          <TouchableOpacity onPress={() => { setManual(true); setSizeId(null); setBrand(""); setModel(""); }} style={styles.linkRow} accessibilityRole="button">
            <ReusableText text="Not in the list" family="medium" size={13} color={C.primary} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {catalogState === "error" && !manual ? (
            <><ReusableText text="Can't load the tyre list right now" family="regular" size={11} color={C.gray2} /><HeightSpacer height={8} /></>
          ) : catalogState === "ready" && choices.length === 0 && !manual ? (
            <><ReusableText text="No listed tyres for this size yet" family="regular" size={11} color={C.gray2} /><HeightSpacer height={8} /></>
          ) : null}
          <SelectField label="Brand *" value={brand} onChange={setBrand} options={brandNames} placeholder="Select brand" />
          <SelectField label="Tyre type *" value={model} onChange={setModel} options={TYRE_TYPES} placeholder="Select tyre type" />
          {manual && sizeOk && catalogState === "ready" && choices.length > 0 ? (
            <TouchableOpacity onPress={() => { setManual(false); setBrand(""); setModel(""); }} style={styles.linkRow} accessibilityRole="button">
              <ReusableText text="Pick from the tyre list instead" family="medium" size={13} color={C.primary} />
            </TouchableOpacity>
          ) : null}
        </>
      )}

      <FormField label="Condition">
        <SegmentedButtons options={CONDITIONS} value={condition} onChange={setCondition} labels={CONDITION_LABEL} />
      </FormField>

      <FormField label="Price (GHS) *">
        <FormInput value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 850" />
      </FormField>

      <FormField label={`Photos (${photos.photos.length}/${MAX_PHOTOS}) *`}>
        <PhotoGrid photos={photos.photos} canAddMore={photos.canAddMore} onAdd={() => void photos.capture()} onRemove={photos.remove} />
        {photos.hasDeferred && (<><HeightSpacer height={6} /><ReusableText text="You're offline — photos upload automatically when you reconnect." family="regular" size={11} color={C.gray2} /></>)}
      </FormField>

      <StockToggle inStock={inStock} onToggle={() => setInStock((v) => !v)} />

      <ReusableBtn
        onPress={() => void save()}
        btnText={saving ? "Saving…" : photos.uploading ? "Uploading photo…" : existing ? "Save changes" : "Add tyre listing"}
        backgroundColor={saving || photos.uploading ? C.gray2 : C.primary}
        textColor={C.white}
        height={52}
        borderRadius={12}
        fontSize={SIZES.medium}
        disabled={saving || photos.uploading}
      />
      <PickerModal
        visible={picker === "brand"} title="Select brand" items={brandItems} selected={brand}
        onSelect={(v) => { if (v !== brand) { setBrand(v); setModel(""); setSizeId(null); } setPicker(null); }}
        onClose={() => setPicker(null)} emptyText={catalogState === "loading" ? "Loading…" : "No brands found"}
      />
      <PickerModal
        visible={picker === "model"} title="Select model" items={modelChoices.map((c) => c.model)} selected={model}
        onSelect={(v) => { const c = modelChoices.find((m) => m.model === v); if (c) { setModel(c.model); setSizeId(c.sizeId); } setPicker(null); }}
        onClose={() => setPicker(null)} emptyText="No models found"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sizeRow: { flexDirection: "row", gap: 8 },
  linkRow: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: 16 },
});
