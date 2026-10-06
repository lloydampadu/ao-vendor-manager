import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { getCachedTyreCatalog, type TyreListing } from "@/lib/db";
import { newLocalId, saveTyreListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { WIDTHS, HEIGHTS, DIAMETERS } from "@/lib/tyre-sizes";
import { useSyncStore } from "@/store/sync-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import SelectField from "../../components/Reusable/SelectField";
import { ReusableBtn, HeightSpacer, FormField, FormInput, SegmentedButtons, StockToggle, PhotoGrid, ReusableText } from "../../components";
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
  const photos = usePhotoUpload({ max: MAX_PHOTOS, allowDeferred: true, initial: existing ? parseJson<string[]>(existing.photos, []) : [] });

  useEffect(() => {
    getCachedTyreCatalog()
      .then((catalog) => setBrandNames(catalog.map((b) => b.brandName).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))))
      .catch(() => setBrandNames([]));
  }, []);

  function validate(): { w: number; h: number; d: number; priceGhs: number } | null {
    const w = parseInt(width, 10), h = parseInt(height, 10), d = parseInt(diameter, 10), priceGhs = parseInt(price, 10);
    if (!(w > 0)) { Alert.alert("Tyre width", "Enter a valid width, e.g. 205."); return null; }
    if (!(h > 0)) { Alert.alert("Tyre height", "Enter a valid height, e.g. 55."); return null; }
    if (!(d > 0)) { Alert.alert("Rim size", "Enter a valid rim diameter, e.g. 16."); return null; }
    if (!brand.trim()) { Alert.alert("Brand", "Choose or type the tyre brand."); return null; }
    if (!model.trim()) { Alert.alert("Tyre type", "Choose the tyre type."); return null; }
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
        <View style={{ flex: 1 }}><SelectField label="Width (mm) *" value={width} onChange={setWidth} options={WIDTHS.map(String)} placeholder="205" keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><SelectField label="Height (%) *" value={height} onChange={setHeight} options={HEIGHTS.map(String)} placeholder="55" keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><SelectField label={'Rim (") *'} value={diameter} onChange={setDiameter} options={DIAMETERS.map(String)} placeholder="16" keyboardType="number-pad" /></View>
      </View>

      <SelectField label="Brand *" value={brand} onChange={setBrand} options={brandNames} placeholder="Select brand" />
      <SelectField label="Tyre type *" value={model} onChange={setModel} options={TYRE_TYPES} placeholder="Select tyre type" />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sizeRow: { flexDirection: "row", gap: 8 },
});
