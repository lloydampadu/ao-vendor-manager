import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { cacheFluidCatalog, getCachedFluidCatalog, getFluidListings, type FluidListing } from "@/lib/db";
import { fluidCatalogApi, type ApiFluidCatalog } from "@/lib/api";
import { fluidListingTitle, fluidNote, kindOf, pickProblem, type FluidPick } from "@/lib/fluid-catalog";
import {
  ALREADY_LISTED_MESSAGE, NOT_LISTED, NO_GRADE, brandOptions, chooseBrand, chooseKind, emptyPick, findExistingFluid, gradeOptions, productOptions, reconcilePick,
} from "@/lib/fluid-form";
import { approvedFluidKinds } from "@/lib/approvals";
import { newLocalId, saveFluidListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { parsePriceAdvice, priceNote } from "@/lib/tyre-catalog";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { ReusableBtn, HeightSpacer, FormField, FormInput, StockToggle, PhotoGrid, ReusableText, SelectButton, PickerModal } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditFluidListing">;
type Picker = "kind" | "brand" | "product" | "grade" | "colour" | "mix" | "size" | null;
const MAX_PHOTOS = 4;
const LOADING = "Loading…";
const NO_LIST = "Connect to the internet once to load the list";

/**
 * Oils & fluids listing: every field is a dropdown from our catalog, so the same product is one
 * card whichever vendor posts it. Only the brand and the product line may be typed ("Not in the
 * list"); those wait for approval. Genuine only: the vendor must tick it. Editing changes only
 * price, photos and stock.
 */
export default function AddEditFluidListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const existing = useRoute<RouteProps>().params?.listing;
  const specialties = useAuthStore((s) => s.vendor?.specialties ?? []);
  const startSync = useSyncStore((s) => s.startSync);
  const [catalog, setCatalog] = useState<ApiFluidCatalog | null>(null);
  const [pick, setPick] = useState<FluidPick>(emptyPick);
  const [typedBrand, setTypedBrand] = useState(false);
  const [typedLine, setTypedLine] = useState(false);
  const [price, setPrice] = useState(existing ? String(existing.price_ghs) : "");
  const [inStock, setInStock] = useState(existing ? existing.in_stock === 1 : true);
  const [picker, setPicker] = useState<Picker>(null);
  const [saving, setSaving] = useState(false);
  const [cacheRead, setCacheRead] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const photos = usePhotoUpload({ max: MAX_PHOTOS, allowDeferred: true, initial: existing ? parseJson<string[]>(existing.photos, []) : [] });

  // The cached catalog first (so it works offline), then a fresh copy when online.
  useEffect(() => {
    let live = true;
    void getCachedFluidCatalog().then((c) => { if (live && c) setCatalog((prev) => prev ?? c); }).catch(() => {}).finally(() => { if (live) setCacheRead(true); });
    fluidCatalogApi.get().then((c) => { if (live) { setCatalog(c); void cacheFluidCatalog(c); } }).catch(() => { if (live) setFetchFailed(true); });
    return () => { live = false; };
  }, []);

  const loading = !catalog;
  // No saved copy and no network: say so instead of "Loading…" for ever.
  const noList = !catalog && cacheRead && fetchFailed;
  const kinds = useMemo(() => (catalog ? approvedFluidKinds(specialties, catalog.kinds) : []), [catalog, specialties]);
  // A fresh catalog or a withdrawn approval can invalidate earlier picks: drop them.
  useEffect(() => {
    if (catalog) setPick((p) => reconcilePick(catalog, kinds, p, typedLine));
  }, [catalog, kinds, typedLine]);
  const kind = catalog && pick.kindId ? kindOf(catalog, pick.kindId) : null;
  const brandName = pick.brandId ? catalog?.brands.find((b) => b.id === pick.brandId)?.name ?? "" : pick.brandName;
  const set = (p: Partial<FluidPick>) => setPick((prev) => ({ ...prev, ...p }));
  const note = existing ? fluidNote(existing) ?? priceNote(parsePriceAdvice(existing.price_advice)) : null;

  async function save(): Promise<void> {
    const priceGhs = parseInt(price, 10);
    if (!existing) {
      if (!catalog) { Alert.alert("Not ready", "The product list hasn't loaded yet. Connect to the internet once, then try again."); return; }
      const problem = pickProblem(catalog, pick);
      if (problem) { Alert.alert("Check the product", problem); return; }
    }
    if (!(priceGhs > 0)) { Alert.alert("Price", "Enter a valid price."); return; }
    if (photos.uploading) { Alert.alert("Please wait", "A photo is still uploading."); return; }
    setSaving(true);
    try {
      if (!existing) {
        // Already on this vendor's list (same product and size): take them to it instead of adding a copy.
        const dup = findExistingFluid(await getFluidListings(), pick);
        if (dup) {
          Alert.alert("Already listed", ALREADY_LISTED_MESSAGE);
          nav.replace("AddEditFluidListing", { listing: dup });
          return;
        }
      }
      const row: FluidListing = existing
        ? { ...existing, price_ghs: priceGhs, photos: JSON.stringify(photos.urls), in_stock: inStock ? 1 : 0,
            price_advice: existing.price_ghs === priceGhs ? existing.price_advice : null, updated_at: new Date().toISOString() }
        : {
            id: newLocalId(), server_id: null, fluid_product_id: null,
            kind_id: pick.kindId, kind: kind!.name, brand_id: pick.brandId, brand: brandName.trim(), product: pick.product.trim(),
            grade: pick.grade, coolant_colour: pick.colour, coolant_mix: pick.mix, size_label: pick.size,
            status: "LOCAL", review_status: "OK", hidden: 0, hidden_reason: null, rejected_reason: null,
            price_ghs: priceGhs, photos: JSON.stringify(photos.urls), in_stock: inStock ? 1 : 0,
            price_advice: null, updated_at: new Date().toISOString(),
          };
      await saveFluidListing(row, !existing);
      void startSync();
      nav.goBack();
    } catch {
      Alert.alert("Couldn't save", "Something went wrong saving on this phone. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const select = (label: string, value: string, placeholder: string, which: Exclude<Picker, null>, disabled = false) => (
    <FormField label={label}>
      <SelectButton value={loading ? "" : value} placeholder={loading ? (noList ? NO_LIST : LOADING) : placeholder} onPress={() => setPicker(which)} disabled={loading || disabled}
        accessibilityLabel={label.replace(" *", "")} />
    </FormField>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: C.offwhite }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {existing ? (
        <>
          <ReusableText text={fluidListingTitle(existing, catalog)} family="bold" size={17} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text="To change the product, delete this listing and add it again." family="regular" size={12} color={C.gray2} />
          {note ? (<><HeightSpacer height={8} /><ReusableText text={note} family="medium" size={12} color={C.primary} /></>) : null}
          <HeightSpacer height={16} />
        </>
      ) : (
        <>
          {select("Kind *", kind?.name ?? "", "Choose the kind", "kind")}
          {typedBrand ? (
            <FormField label="Brand, as written on the pack *">
              <FormInput value={pick.brandName} onChangeText={(t) => set({ brandName: t, genuine: false })} placeholder="e.g. Fuchs" accessibilityLabel="Brand" autoCapitalize="words" />
            </FormField>
          ) : select("Brand *", brandName, "Choose the brand", "brand", !kind)}
          {typedLine || typedBrand ? (
            <FormField label="Product name, as written on the pack *">
              <FormInput value={pick.product} onChangeText={(t) => set({ product: t })} placeholder="e.g. Titan GT1" accessibilityLabel="Product name" autoCapitalize="words" />
            </FormField>
          ) : select("Product *", pick.product, "Choose the product", "product", !pick.brandId)}
          {typedLine || typedBrand ? (
            <ReusableText text="We'll check this and add it to the list. Customers see it once it's approved." family="regular" size={11} color={C.gray2} />
          ) : null}
          {kind && kind.grades.length > 0 ? select(kind.gradeRequired ? "Grade *" : "Grade", pick.grade || (kind.gradeRequired ? "" : NO_GRADE), "Choose the grade", "grade") : null}
          {kind?.coolant ? (
            <>
              {select("Colour *", catalog?.coolantColours.find((c) => c.value === pick.colour)?.label ?? "", "Choose the colour", "colour")}
              {select("Mix *", catalog?.coolantMixes.find((m) => m.value === pick.mix)?.label ?? "", "Concentrate or ready-mixed", "mix")}
            </>
          ) : null}
          {select("Size *", pick.size, "Choose the size", "size", !kind)}
        </>
      )}

      <FormField label="Price *">
        <FormInput value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 350" accessibilityLabel="Price" />
      </FormField>

      <FormField label={`Photos of the pack (${photos.photos.length}/${MAX_PHOTOS})`}>
        <PhotoGrid photos={photos.photos} canAddMore={photos.canAddMore} onAdd={() => void photos.capture()} onRemove={photos.remove} />
        <HeightSpacer height={6} />
        <ReusableText text="Only our team sees these. Customers see our own product photo." family="regular" size={11} color={C.gray2} />
      </FormField>

      {!existing ? (
        <TouchableOpacity style={styles.tick} onPress={() => set({ genuine: !pick.genuine })} accessibilityRole="checkbox" accessibilityState={{ checked: pick.genuine }}>
          <Ionicons name={pick.genuine ? "checkbox" : "square-outline"} size={24} color={pick.genuine ? C.primary : C.gray2} />
          <View style={{ flex: 1 }}>
            <ReusableText text={`This is genuine ${brandName.trim() || "brand"}`} family="medium" size={14} color={C.secondary} />
            <ReusableText text="We only sell genuine products. Copies are not listed." family="regular" size={11} color={C.gray2} />
          </View>
        </TouchableOpacity>
      ) : null}

      <StockToggle inStock={inStock} onToggle={() => setInStock((v) => !v)} />

      <ReusableBtn onPress={() => void save()} btnText={saving ? "Saving…" : existing ? "Save changes" : "Add listing"}
        backgroundColor={saving || photos.uploading ? C.gray2 : C.primary} textColor={C.white} height={52} borderRadius={12} fontSize={SIZES.medium} disabled={saving || photos.uploading} />

      <PickerModal visible={picker === "kind"} title="Choose the kind" items={kinds.map((k) => k.name)} selected={kind?.name ?? ""}
        onSelect={(v) => {
          const k = kinds.find((x) => x.name === v);
          if (k) { setPick((p) => chooseKind(p, k.id)); setTypedBrand(false); setTypedLine(false); }
          setPicker(null);
        }}
        onClose={() => setPicker(null)} emptyText="Ask for Oils & fluids approval first" />
      <PickerModal visible={picker === "brand"} title="Choose the brand" items={catalog ? brandOptions(catalog) : []} selected={brandName}
        onSelect={(v) => {
          const b = catalog?.brands.find((x) => x.name === v);
          setPick((p) => chooseBrand(p, v === NOT_LISTED ? null : b?.id ?? p.brandId));
          setTypedBrand(v === NOT_LISTED);
          setTypedLine(false);
          setPicker(null);
        }} onClose={() => setPicker(null)} emptyText="No brands yet" />
      <PickerModal visible={picker === "product"} title="Choose the product" items={catalog ? productOptions(catalog, pick) : []} selected={pick.product}
        onSelect={(v) => { if (v === NOT_LISTED) { setTypedLine(true); set({ product: "" }); } else set({ product: v }); setPicker(null); }}
        onClose={() => setPicker(null)} emptyText="No products yet" />
      <PickerModal visible={picker === "grade"} title="Choose the grade" items={kind ? gradeOptions(kind) : []} selected={pick.grade || (kind?.gradeRequired ? "" : NO_GRADE)}
        onSelect={(v) => { set({ grade: v === NO_GRADE ? "" : v }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No grades" />
      <PickerModal visible={picker === "colour"} title="Choose the colour" items={catalog?.coolantColours.map((c) => c.label) ?? []} selected={catalog?.coolantColours.find((c) => c.value === pick.colour)?.label ?? ""}
        onSelect={(v) => { set({ colour: catalog?.coolantColours.find((c) => c.label === v)?.value ?? "" }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No colours" />
      <PickerModal visible={picker === "mix"} title="Concentrate or ready-mixed" items={catalog?.coolantMixes.map((m) => m.label) ?? []} selected={catalog?.coolantMixes.find((m) => m.value === pick.mix)?.label ?? ""}
        onSelect={(v) => { set({ mix: catalog?.coolantMixes.find((m) => m.label === v)?.value ?? "" }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No mixes" />
      <PickerModal visible={picker === "size"} title="Choose the size" items={catalog?.sizes.map((s) => s.label) ?? []} selected={pick.size}
        onSelect={(v) => { set({ size: v }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No sizes" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  tick: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, marginBottom: 8 },
});
