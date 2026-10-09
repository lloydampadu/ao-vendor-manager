import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { cacheBatteryCatalog, getBatteryListings, getCachedBatteryCatalog, type BatteryListing } from "@/lib/db";
import { batteryCatalogApi, type ApiBatteryCatalog } from "@/lib/api";
import {
  ALREADY_LISTED_MESSAGE, NOT_LISTED, batteryListingTitle, batteryPickProblem, brandOptions, catalogProductFor, emptyBatteryPick,
  findExistingBattery, pickBrand, pickSize, pickTerminal, reconcileBatteryPick, resolveTypedBrand, warrantyProblem, withCatalogFigures, type BatteryPick,
} from "@/lib/battery-form";
import { listingNote } from "@/lib/listing-note";
import { newLocalId, saveBatteryListing } from "@/lib/listings";
import { parseJson } from "@/lib/assignment-status";
import { parsePriceAdvice, priceNote } from "@/lib/tyre-catalog";
import { useSyncStore } from "@/store/sync-store";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { ReusableBtn, HeightSpacer, FormField, FormInput, StockToggle, PhotoGrid, ReusableText, SelectButton, PickerModal } from "../../components";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type RouteProps = RouteProp<ProductsStackParamList, "AddEditBatteryListing">;
type Picker = "brand" | "size" | "terminal" | "type" | "voltage" | null;
const MAX_PHOTOS = 4;
const LOADING = "Loading…";
const NO_LIST = "Connect to the internet once to load the list";

/**
 * Battery listing (spec 4e.4): brand → size code → terminal side from our lists, so the same battery
 * is one card whichever vendor posts it. A battery already in the list brings its own figures; a new
 * one (or a brand typed under "Not in the list") needs what its label says, and waits for approval.
 * Genuine only, and the warranty is required. Editing changes only price, photos, stock and warranty.
 */
export default function AddEditBatteryListingScreen(): React.JSX.Element {
  const C = useThemeColors();
  const nav = useNavigation<NativeStackNavigationProp<ProductsStackParamList>>();
  const existing = useRoute<RouteProps>().params?.listing;
  const startSync = useSyncStore((s) => s.startSync);
  const [catalog, setCatalog] = useState<ApiBatteryCatalog | null>(null);
  const [pick, setPick] = useState<BatteryPick>(() => (existing ? { ...emptyBatteryPick(), warranty: String(existing.warranty_months) } : emptyBatteryPick()));
  const [typedBrand, setTypedBrand] = useState(false);
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
    void getCachedBatteryCatalog().then((c) => { if (live && c) setCatalog((prev) => prev ?? c); }).catch(() => {}).finally(() => { if (live) setCacheRead(true); });
    batteryCatalogApi.get().then((c) => { if (live) { setCatalog(c); void cacheBatteryCatalog(c); } }).catch(() => { if (live) setFetchFailed(true); });
    return () => { live = false; };
  }, []);

  const loading = !catalog;
  const noList = !catalog && cacheRead && fetchFailed;
  // A fresh catalog can drop earlier picks, or bring the figures of a battery that is now listed.
  useEffect(() => {
    if (catalog && !existing) setPick((p) => withCatalogFigures(catalog, reconcileBatteryPick(catalog, p)));
  }, [catalog, existing]);
  const set = (p: Partial<BatteryPick>) => setPick((prev) => (catalog ? withCatalogFigures(catalog, { ...prev, ...p }) : { ...prev, ...p }));
  const applyPick = <V,>(fn: (p: BatteryPick, v: V) => BatteryPick, v: V) => setPick((prev) => (catalog ? withCatalogFigures(catalog, fn(prev, v)) : fn(prev, v)));
  // A brand typed under "Not in the list" that is in the list counts as that brand.
  const eff = catalog ? withCatalogFigures(catalog, resolveTypedBrand(catalog, pick)) : pick;
  const known = catalog ? catalogProductFor(catalog, eff) : null;
  const brandName = eff.brandId ? catalog?.brands.find((b) => b.id === eff.brandId)?.name ?? "" : eff.brandName;
  const sizeCode = catalog?.sizes.find((s) => s.id === pick.sizeId)?.code ?? "";
  const typeName = catalog?.types.find((t) => t.value === pick.type)?.label ?? "";
  const sideName = catalog?.terminals.find((t) => t.value === pick.terminal)?.label ?? "";
  const newBattery = !known && !!eff.sizeId && !!eff.terminal && (!!eff.brandId || eff.brandName.trim().length >= 2);
  const maxWarranty = catalog?.warrantyMaxMonths ?? 60;
  const note = existing ? listingNote(existing) ?? priceNote(parsePriceAdvice(existing.price_advice)) : null;

  async function save(): Promise<void> {
    const priceGhs = parseInt(price, 10);
    if (!existing) {
      if (!catalog) { Alert.alert("Not ready", "The battery list hasn't loaded yet. Connect to the internet once, then try again."); return; }
      const problem = batteryPickProblem(catalog, eff);
      if (problem) { Alert.alert("Check the battery", problem); return; }
    } else {
      const problem = warrantyProblem(pick.warranty, maxWarranty);
      if (problem) { Alert.alert("Warranty", problem); return; }
    }
    if (!(priceGhs > 0)) { Alert.alert("Price", "Enter a valid price."); return; }
    if (photos.uploading) { Alert.alert("Please wait", "A photo is still uploading."); return; }
    setSaving(true);
    try {
      if (!existing) {
        // Already on this vendor's list (same brand, size and side): take them to it instead of adding a copy.
        const dup = findExistingBattery(await getBatteryListings(), eff);
        if (dup) {
          Alert.alert("Already listed", ALREADY_LISTED_MESSAGE);
          nav.replace("AddEditBatteryListing", { listing: dup });
          return;
        }
      }
      const now = new Date().toISOString();
      const warrantyMonths = parseInt(pick.warranty, 10);
      const row: BatteryListing = existing
        ? { ...existing, price_ghs: priceGhs, photos: JSON.stringify(photos.urls), in_stock: inStock ? 1 : 0, warranty_months: warrantyMonths,
            price_advice: existing.price_ghs === priceGhs ? existing.price_advice : null, updated_at: now }
        : {
            id: newLocalId(), server_id: null, battery_product_id: known?.id ?? null,
            brand_id: eff.brandId, brand: brandName.trim(), size_id: eff.sizeId, size_code: sizeCode, terminal: eff.terminal,
            battery_type: eff.type, voltage: eff.voltage, capacity_ah: parseInt(eff.capacityAh, 10), cca: eff.cca.trim() ? parseInt(eff.cca, 10) : null,
            warranty_months: warrantyMonths, status: "LOCAL", review_status: "OK", hidden: 0, hidden_reason: null, rejected_reason: null,
            price_ghs: priceGhs, photos: JSON.stringify(photos.urls), in_stock: inStock ? 1 : 0, price_advice: null, updated_at: now,
          };
      await saveBatteryListing(row, !existing);
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
          <ReusableText text={batteryListingTitle(existing)} family="bold" size={17} color={C.secondary} />
          <HeightSpacer height={4} />
          <ReusableText text="To change the battery, delete this listing and add it again." family="regular" size={12} color={C.gray2} />
          {note ? (<><HeightSpacer height={8} /><ReusableText text={note} family="medium" size={12} color={C.primary} /></>) : null}
          <HeightSpacer height={16} />
        </>
      ) : (
        <>
          {typedBrand ? (
            <FormField label="Brand, as written on the battery *">
              <FormInput value={pick.brandName} onChangeText={(t) => set({ brandName: t, genuine: false })} placeholder="e.g. Fengli" accessibilityLabel="Brand" autoCapitalize="words" />
              <TouchableOpacity onPress={() => { setPick((p) => pickBrand(p, null)); setTypedBrand(false); }} accessibilityRole="button" accessibilityLabel="Choose the brand from the list">
                <ReusableText text="Choose from the list" family="medium" size={12} color={C.primary} />
              </TouchableOpacity>
            </FormField>
          ) : select("Brand *", brandName, "Choose the brand", "brand")}
          {select("Size code *", sizeCode, "e.g. NS60, 55D23, DIN 66", "size")}
          {select("Positive terminal *", sideName, "Left or right", "terminal")}
          {known ? (
            <ReusableText text={`${known.voltage}V · ${known.capacityAh}Ah${known.cca ? ` · ${known.cca} CCA` : ""} · ${catalog?.types.find((t) => t.value === known.type)?.label ?? known.type}`}
              family="medium" size={13} color={C.secondary} />
          ) : null}
          {newBattery || (typedBrand && !eff.brandId) ? (
            <>
              <ReusableText text="This battery isn't in our list yet. Enter what its label says. We'll check it, and customers see it once it's approved." family="regular" size={11} color={C.gray2} />
              <HeightSpacer height={8} />
              {select("Type *", typeName, "Choose the type", "type")}
              {select("Voltage *", `${pick.voltage}V`, "12V or 24V", "voltage")}
              <FormField label="Capacity (Ah) *">
                <FormInput value={pick.capacityAh} onChangeText={(t) => set({ capacityAh: t.replace(/[^\d]/g, "") })} keyboardType="number-pad" placeholder="e.g. 45" accessibilityLabel="Capacity in Ah" />
              </FormField>
              <FormField label="CCA (if on the label)">
                <FormInput value={pick.cca} onChangeText={(t) => set({ cca: t.replace(/[^\d]/g, "") })} keyboardType="number-pad" placeholder="e.g. 330" accessibilityLabel="CCA" />
              </FormField>
            </>
          ) : null}
        </>
      )}

      <FormField label="Price *">
        <FormInput value={price} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 900" accessibilityLabel="Price" />
      </FormField>

      <FormField label="Warranty in months *">
        <FormInput value={pick.warranty} onChangeText={(t) => setPick((p) => ({ ...p, warranty: t.replace(/[^\d]/g, "") }))} keyboardType="number-pad" placeholder="e.g. 12" accessibilityLabel="Warranty in months" />
        <HeightSpacer height={6} />
        <ReusableText text={`0 to ${maxWarranty}. Customers see the shortest warranty among the vendors who could supply the order.`} family="regular" size={11} color={C.gray2} />
      </FormField>

      <FormField label={`Photos of the battery (${photos.photos.length}/${MAX_PHOTOS})`}>
        <PhotoGrid photos={photos.photos} canAddMore={photos.canAddMore} onAdd={() => void photos.capture()} onRemove={photos.remove} />
        <HeightSpacer height={6} />
        <ReusableText text="Only our team sees these. Customers see our own product photo." family="regular" size={11} color={C.gray2} />
      </FormField>

      {!existing ? (
        <TouchableOpacity style={styles.tick} onPress={() => setPick((p) => ({ ...p, genuine: !p.genuine }))} accessibilityRole="checkbox" accessibilityState={{ checked: pick.genuine }}>
          <Ionicons name={pick.genuine ? "checkbox" : "square-outline"} size={24} color={pick.genuine ? C.primary : C.gray2} />
          <View style={{ flex: 1 }}>
            <ReusableText text={`This is a genuine ${brandName.trim() || "brand"} battery`} family="medium" size={14} color={C.secondary} />
            <ReusableText text="We only sell new, genuine batteries. Copies are not listed." family="regular" size={11} color={C.gray2} />
          </View>
        </TouchableOpacity>
      ) : null}

      <StockToggle inStock={inStock} onToggle={() => setInStock((v) => !v)} />

      <ReusableBtn onPress={() => void save()} btnText={saving ? "Saving…" : existing ? "Save changes" : "Add listing"}
        backgroundColor={saving || photos.uploading ? C.gray2 : C.primary} textColor={C.white} height={52} borderRadius={12} fontSize={SIZES.medium} disabled={saving || photos.uploading} />

      <PickerModal visible={picker === "brand"} title="Choose the brand" items={catalog ? brandOptions(catalog) : []} selected={brandName}
        onSelect={(v) => {
          const b = catalog?.brands.find((x) => x.name === v);
          setPick((p) => (catalog ? withCatalogFigures(catalog, pickBrand(p, v === NOT_LISTED ? null : b?.id ?? p.brandId)) : p));
          setTypedBrand(v === NOT_LISTED);
          setPicker(null);
        }} onClose={() => setPicker(null)} emptyText="No brands yet" />
      <PickerModal visible={picker === "size"} title="Choose the size code" items={catalog?.sizes.map((s) => s.code) ?? []} selected={sizeCode}
        onSelect={(v) => { applyPick(pickSize, catalog?.sizes.find((s) => s.code === v)?.id ?? ""); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No sizes" />
      <PickerModal visible={picker === "terminal"} title="Where is the positive (+) terminal?" items={catalog?.terminals.map((t) => t.label) ?? []} selected={sideName}
        onSelect={(v) => { applyPick(pickTerminal, (catalog?.terminals.find((t) => t.label === v)?.value ?? "") as BatteryPick["terminal"]); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No sides" />
      <PickerModal visible={picker === "type"} title="Choose the type" items={catalog?.types.map((t) => t.label) ?? []} selected={typeName}
        onSelect={(v) => { set({ type: catalog?.types.find((t) => t.label === v)?.value ?? "" }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No types" />
      <PickerModal visible={picker === "voltage"} title="Choose the voltage" items={catalog?.voltages.map((x) => `${x}V`) ?? []} selected={`${pick.voltage}V`}
        onSelect={(v) => { set({ voltage: parseInt(v, 10) }); setPicker(null); }} onClose={() => setPicker(null)} emptyText="No voltages" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  tick: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, marginBottom: 8 },
});
