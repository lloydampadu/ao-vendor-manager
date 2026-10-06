import React, { useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import ReusableBtn from "./Reusable/ReusableBtn";
import HeightSpacer from "./Reusable/HeightSpacer";
import { PhotoGrid } from "./PhotoGrid";
import { SIZES, useThemeColors } from "../constants/theme";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";

export const CONDITION_OPTIONS = ["Brand New", "Home Used"] as const;
export type Condition = (typeof CONDITION_OPTIONS)[number];
const MAX_PHOTOS_PER_CONDITION = 4;

export type PriceEntry = { condition: Condition; priceGhs: number };

export type QuotePayload = {
  prices: PriceEntry[];
  /** Photos per condition. May contain local file URIs when quoted offline — the sync queue uploads them. */
  photosByCondition: Partial<Record<Condition, string[]>>;
  /** Flat list for backward compat with the API/DB. */
  photos: string[];
  location?: { latitude: number; longitude: number };
};

type Props = {
  /** When true, every priced condition needs at least one photo. */
  requirePhotos?: boolean;
  /** Allow quoting with photos that upload later (offline-first). */
  allowDeferredPhotos?: boolean;
  onSubmit: (payload: QuotePayload) => Promise<void>;
  initialValues?: { priceGhs?: number; availability?: string; photos?: string[]; prices?: PriceEntry[]; photosByCondition?: Partial<Record<Condition, string[]>> };
  submitLabel?: string;
};

function parsePrice(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function QuoteForm({ requirePhotos = true, allowDeferredPhotos = true, onSubmit, initialValues, submitLabel }: Props): React.JSX.Element {
  const C = useThemeColors();

  const [prices, setPrices] = useState<Record<Condition, string>>(() => {
    const map: Record<Condition, string> = { "Brand New": "", "Home Used": "" };
    if (initialValues?.prices?.length) {
      for (const p of initialValues.prices) if (p.condition in map) map[p.condition] = String(p.priceGhs);
    } else if (initialValues?.priceGhs) {
      const cond = CONDITION_OPTIONS.includes(initialValues.availability as Condition) ? (initialValues.availability as Condition) : "Brand New";
      map[cond] = String(initialValues.priceGhs);
    }
    return map;
  });

  const brandNew = usePhotoUpload({ max: MAX_PHOTOS_PER_CONDITION, allowDeferred: allowDeferredPhotos, initial: initialValues?.photosByCondition?.["Brand New"] ?? [], quality: 0.75 });
  const homeUsed = usePhotoUpload({ max: MAX_PHOTOS_PER_CONDITION, allowDeferred: allowDeferredPhotos, initial: initialValues?.photosByCondition?.["Home Used"] ?? [], quality: 0.75 });
  const pickers: Record<Condition, typeof brandNew> = { "Brand New": brandNew, "Home Used": homeUsed };

  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filledConditions = CONDITION_OPTIONS.filter((c) => parsePrice(prices[c]) > 0);

  async function captureFor(cond: Condition) {
    await pickers[cond].capture();
    // Grab a one-time location alongside the first photo; best effort.
    if (!location) {
      const perm = await Location.getForegroundPermissionsAsync();
      const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
      if (granted) {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
          .catch(() => {});
      }
    }
  }

  async function submit() {
    const priceEntries: PriceEntry[] = CONDITION_OPTIONS
      .map((c) => ({ condition: c, priceGhs: parsePrice(prices[c]) }))
      .filter((e) => e.priceGhs > 0);
    if (priceEntries.length === 0) {
      Alert.alert("No price entered", "Enter a price for at least one condition.");
      return;
    }
    if (priceEntries.some((e) => pickers[e.condition].uploading)) {
      Alert.alert("Please wait", "Photos are still uploading.");
      return;
    }
    if (requirePhotos) {
      const missing = priceEntries.filter((e) => pickers[e.condition].urls.length === 0);
      if (missing.length > 0) {
        Alert.alert(
          "Photo needed",
          missing.length > 1 ? "Take at least one photo for each condition you priced." : `Take at least one photo of the ${missing[0].condition} part.`,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const byCondition: Partial<Record<Condition, string[]>> = {};
      for (const e of priceEntries) byCondition[e.condition] = pickers[e.condition].urls;
      await onSubmit({
        prices: priceEntries,
        photosByCondition: byCondition,
        photos: priceEntries.flatMap((e) => byCondition[e.condition] ?? []),
        ...(location ? { location } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <ReusableText text="Your price (GHS)" family="medium" size={SIZES.small} color={C.secondary} />
      <HeightSpacer height={4} />
      <ReusableText text="Enter a price for each type you have. Leave blank if you don't have it." family="regular" size={11} color={C.gray2} />
      <HeightSpacer height={10} />

      {CONDITION_OPTIONS.map((opt) => (
        <View key={opt} style={styles.priceRow}>
          <View style={styles.conditionLabel}>
            <ReusableText text={opt} family="medium" size={SIZES.small} color={C.secondary} />
          </View>
          <TextInput
            style={[styles.input, { borderColor: C.gray, color: C.secondary, backgroundColor: C.white }]}
            value={prices[opt]}
            onChangeText={(v) => setPrices((prev) => ({ ...prev, [opt]: v.replace(/[^\d]/g, "") }))}
            keyboardType="number-pad"
            placeholder="Leave empty if you don't have it"
            placeholderTextColor={C.gray2}
            accessibilityLabel={`${opt} price`}
          />
        </View>
      ))}

      {requirePhotos && filledConditions.length > 0 && (
        <>
          <HeightSpacer height={16} />
          {filledConditions.map((cond) => {
            const picker = pickers[cond];
            return (
              <View key={cond} style={[styles.photoBlock, { borderColor: C.gray, backgroundColor: C.white }]}>
                <View style={styles.photoHeader}>
                  <View style={styles.badge}>
                    <Ionicons name={cond === "Brand New" ? "sparkles-outline" : "refresh-outline"} size={14} color={C.primary} />
                    <ReusableText text={`  ${cond} photos`} family="bold" size={SIZES.small} color={C.primary} />
                  </View>
                  <ReusableText text={`${picker.photos.length}/${MAX_PHOTOS_PER_CONDITION}`} family="regular" size={11} color={C.gray2} />
                </View>
                <PhotoGrid photos={picker.photos} canAddMore={picker.canAddMore} onAdd={() => void captureFor(cond)} onRemove={picker.remove} size={72} />
                {picker.hasDeferred && (
                  <ReusableText text="You're offline — photos will upload with your quote when you're back online." family="regular" size={11} color={C.gray2} />
                )}
              </View>
            );
          })}
        </>
      )}

      <HeightSpacer height={20} />
      <ReusableBtn
        onPress={() => void submit()}
        btnText={submitting ? "Sending…" : (submitLabel ?? "Send Quote")}
        backgroundColor={submitting ? C.gray2 : C.primary}
        textColor={C.white}
        height={52}
        borderRadius={10}
        fontSize={SIZES.medium}
        disabled={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: SIZES.medium, fontFamily: "regular" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  conditionLabel: { width: 90 },
  photoBlock: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 10 },
  photoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { flexDirection: "row", alignItems: "center" },
});
