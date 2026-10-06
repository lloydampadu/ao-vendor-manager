import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { LightListing } from "@/lib/db";
import { newLocalId, saveLightListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { PART_CATEGORIES } from "@/lib/parts-catalog";
import { useSyncStore } from "@/store/sync-store";
import { useAuthStore } from "@/store/auth-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { useMakes, useModels, YEARS } from "@/hooks/useVehicleTaxonomy";
import {
  ReusableBtn, ReusableText, HeightSpacer, FormField, FormInput, SelectButton, SegmentedButtons, StockToggle, PhotoGrid, PickerModal,
} from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditLightListing">;

// The 12 most common types as chips; the full Lamps catalog via "Other".
const PRIMARY_LIGHT_TYPES = [
  "Headlight Assembly", "Headlight Bulb", "Headlight Housing", "Headlight Lens", "Tail Light", "Tail Light Lens",
  "Fog Lamp", "Fog Lamp Rear", "Third Brake Light", "Turn Signal/Indicator", "Backup Light", "Dome Light",
];
const ALL_LIGHT_TYPES: string[] = PART_CATEGORIES["Lamps"] ?? [];

const SIDES = ["Left", "Right", "Pair", "N/A"] as const;
type Side = (typeof SIDES)[number];
const CONDITIONS = ["NEW", "USED"] as const;
type Condition = (typeof CONDITIONS)[number];
const CONDITION_LABEL: Record<Condition, string> = { NEW: "Brand New", USED: "Home Used" };
const MAX_PHOTOS = 4;

type Picker = "make" | "model" | "year" | "type" | null;

export default function AddEditLightListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation();
  const route = useRoute<RouteProps>();
  const existing = route.params?.listing;
  const startSync = useSyncStore((s) => s.startSync);
  const vendor = useAuthStore((s) => s.vendor);

  const [lightType, setLightType] = useState(existing?.light_type ?? "");
  const [side, setSide] = useState<Side>((SIDES as readonly string[]).includes(existing?.side ?? "") ? (existing!.side as Side) : "N/A");
  const [make, setMake] = useState(existing?.make ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [year, setYear] = useState(existing?.year ?? "");
  const [condition, setCondition] = useState<Condition>(existing?.condition === "USED" ? "USED" : "NEW");
  const [price, setPrice] = useState(existing ? String(existing.price_ghs) : "");
  const [inStock, setInStock] = useState(existing ? existing.in_stock === 1 : true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const photos = usePhotoUpload({ max: MAX_PHOTOS, allowDeferred: true, initial: existing ? parseJson<string[]>(existing.photos, []) : [] });

  const { makes, loading: makesLoading } = useMakes(vendor?.brands);
  const { models, loading: modelsLoading } = useModels(make);

  const isCustomType = lightType !== "" && !PRIMARY_LIGHT_TYPES.includes(lightType);

  async function save(): Promise<void> {
    const priceGhs = parseInt(price, 10);
    if (!lightType.trim()) { Alert.alert("Light type", "Select the type of light."); return; }
    if (!(priceGhs > 0)) { Alert.alert("Price", "Enter a valid price in GHS."); return; }
    if (photos.uploading) { Alert.alert("Please wait", "A photo is still uploading."); return; }
    if (photos.urls.length === 0) { Alert.alert("Photo needed", "Add at least one photo of the light."); return; }

    setSaving(true);
    try {
      const row: LightListing = {
        id: existing?.id ?? newLocalId(),
        server_id: existing?.server_id ?? null,
        light_type: lightType.trim(), side,
        make: make.trim(), model: model.trim(), year: year.trim(),
        condition, price_ghs: priceGhs,
        photos: JSON.stringify(photos.urls),
        in_stock: inStock ? 1 : 0,
        updated_at: new Date().toISOString(),
      };
      await saveLightListing(row, !existing);
      void startSync();
      nav.goBack();
    } catch {
      Alert.alert("Couldn't save", "Something went wrong saving on this phone. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: C.offwhite }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormField label="Light type *">
          <View style={styles.chipGrid}>
            {PRIMARY_LIGHT_TYPES.map((t) => {
              const active = lightType === t;
              return (
                <TouchableOpacity key={t} style={[styles.chip, { borderColor: C.gray, backgroundColor: C.white }, active && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setLightType(t)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                  <ReusableText text={t} family="medium" size={12} color={active ? C.white : C.secondary} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.chip, { borderColor: C.primary, backgroundColor: isCustomType ? C.primary : C.primary1 }]} onPress={() => setPicker("type")} accessibilityRole="button">
              <ReusableText text={isCustomType ? lightType : "Other →"} family="medium" size={12} color={isCustomType ? C.white : C.primary} numberOfLines={1} />
            </TouchableOpacity>
          </View>
        </FormField>

        <FormField label="Side">
          <SegmentedButtons options={SIDES} value={side} onChange={setSide} />
        </FormField>

        <FormField label="Make">
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

        <FormField label="Condition">
          <SegmentedButtons options={CONDITIONS} value={condition} onChange={setCondition} labels={CONDITION_LABEL} />
        </FormField>

        <FormField label="Price (GHS) *">
          <FormInput value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 350" />
        </FormField>

        <FormField label={`Photos (${photos.photos.length}/${MAX_PHOTOS}) *`}>
          <PhotoGrid photos={photos.photos} canAddMore={photos.canAddMore} onAdd={() => void photos.capture()} onRemove={photos.remove} />
          {photos.hasDeferred && (<><HeightSpacer height={6} /><ReusableText text="You're offline — photos upload automatically when you reconnect." family="regular" size={11} color={C.gray2} /></>)}
        </FormField>

        <StockToggle inStock={inStock} onToggle={() => setInStock((v) => !v)} />

        <ReusableBtn
          onPress={() => void save()}
          btnText={saving ? "Saving…" : photos.uploading ? "Uploading photo…" : existing ? "Save changes" : "Add light listing"}
          backgroundColor={saving || photos.uploading ? C.gray2 : C.primary}
          textColor={C.white}
          height={52}
          borderRadius={12}
          fontSize={SIZES.medium}
          disabled={saving || photos.uploading}
        />
      </ScrollView>

      <PickerModal visible={picker === "make"} title="Select make" items={makes} selected={make} onSelect={(v) => { setMake(v); setModel(""); setPicker(null); }} onClose={() => setPicker(null)} />
      <PickerModal visible={picker === "model"} title="Select model" items={models} selected={model} onSelect={(v) => { setModel(v); setPicker(null); }} onClose={() => setPicker(null)} emptyText={modelsLoading ? "Loading…" : "No models found"} />
      <PickerModal visible={picker === "year"} title="Select year" items={YEARS} selected={year} onSelect={(v) => { setYear(v); setPicker(null); }} onClose={() => setPicker(null)} />
      <PickerModal visible={picker === "type"} title="All light types" items={ALL_LIGHT_TYPES} selected={lightType} onSelect={(v) => { setLightType(v); setPicker(null); }} onClose={() => setPicker(null)} searchThreshold={0} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  twoRow: { flexDirection: "row", alignItems: "flex-start" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
});
