import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/upload";
import { ReusableText } from "../../components";
import { COLORS } from "../../constants/theme";
import type { ProductsStackParamList } from "../navigation/ProductsStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ProductsStackParamList, "AddPartWizard">;
};

type Category = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
};

const CATEGORIES: Category[] = [
  { label: "Brakes",      icon: "disc-outline",          value: "SUSPENSION" },
  { label: "Engine",      icon: "settings-outline",      value: "ENGINE_PARTS" },
  { label: "Tyres",       icon: "ellipse-outline",       value: "TYRES" },
  { label: "Battery",     icon: "battery-full-outline",  value: "ELECTRICALS" },
  { label: "Electrical",  icon: "flash-outline",         value: "ELECTRICALS" },
  { label: "Body",        icon: "car-outline",           value: "BODY_PARTS" },
  { label: "Suspension",  icon: "git-branch-outline",    value: "SUSPENSION" },
  { label: "General",     icon: "grid-outline",          value: "GENERAL" },
];

const BG = COLORS.offwhite;
const CARD = COLORS.white;
const BLUE = COLORS.primary;
const BORDER = "#e5e7eb";
const TEXT = COLORS.secondary;
const SUBTEXT = COLORS.gray2;

type Step = "category" | "name" | "price" | "quantity" | "photo" | "condition" | "success";

const STEPS: Step[] = ["category", "name", "price", "quantity", "photo", "condition", "success"];

export default function AddPartWizardScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [condition, setCondition] = useState<"NEW" | "USED" | "REFURBISHED">("USED");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const totalVisible = STEPS.length - 1; // exclude success from progress

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }
  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  async function addFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    await uploadAssets(result.assets.map((a) => a.uri));
  }

  async function addFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Camera needed", "Please allow camera access to continue."); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;
    await uploadAssets([result.assets[0].uri]);
  }

  async function uploadAssets(uris: string[]) {
    setUploading(true);
    const newUris = [...uris];
    const newUrls: string[] = [];
    try {
      for (const uri of uris) {
        const url = await uploadImage(uri);
        newUrls.push(url);
      }
      setPhotoUris((prev) => [...prev, ...newUris]);
      setPhotoUrls((prev) => [...prev, ...newUrls]);
    } catch {
      Alert.alert("Upload failed", "One or more photos could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(index: number) {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function promptAddMore() {
    Alert.alert("Add photo", undefined, [
      { text: "Camera", onPress: () => void addFromCamera() },
      { text: "Gallery", onPress: () => void addFromGallery() },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function save() {
    if (!name.trim()) { Alert.alert("Please enter the part name"); return; }
    const priceNum = parseInt(price, 10);
    if (!priceNum || priceNum <= 0) { Alert.alert("Please enter a valid price"); return; }
    setSaving(true);
    try {
      await api.post("/vendor/products", {
        name: name.trim(),
        priceGhs: priceNum,
        condition,
        inStock: quantity > 0,
        photos: photoUrls,
      });
      setStep("success");
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>

      {/* Progress dots */}
      {step !== "success" && (
        <View style={styles.progressRow}>
          {STEPS.filter((s) => s !== "success").map((s, i) => (
            <View key={s} style={[styles.dot, i <= stepIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* ── Category ── */}
      {step === "category" && (
        <View style={styles.body}>
          <ReusableText text="What is it?" family="bold" size={26} color={TEXT} />
          <View style={{ height: 24 }} />
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value + cat.label}
                style={[styles.catCard, category === cat.label && styles.catCardActive]}
                onPress={() => setCategory(cat.label)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon}
                  size={32}
                  color={category === cat.label ? BLUE : SUBTEXT}
                />
                <View style={{ height: 8 }} />
                <ReusableText
                  text={cat.label}
                  family={category === cat.label ? "bold" : "regular"}
                  size={13}
                  color={category === cat.label ? BLUE : TEXT}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Name ── */}
      {step === "name" && (
        <View style={styles.body}>
          <ReusableText text="What's the part name?" family="bold" size={26} color={TEXT} />
          <View style={{ height: 8 }} />
          <ReusableText text={category} family="regular" size={15} color={BLUE} />
          <View style={{ height: 28 }} />
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={`e.g. Toyota Brake Pad`}
            placeholderTextColor={SUBTEXT}
            autoFocus
            returnKeyType="done"
          />
        </View>
      )}

      {/* ── Price ── */}
      {step === "price" && (
        <View style={styles.body}>
          <ReusableText text="How much is it?" family="bold" size={26} color={TEXT} />
          <View style={{ height: 40 }} />
          <View style={styles.priceRow}>
            <ReusableText text="GH₵" family="bold" size={28} color={SUBTEXT} />
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={BORDER}
              autoFocus
            />
          </View>
        </View>
      )}

      {/* ── Quantity ── */}
      {step === "quantity" && (
        <View style={styles.body}>
          <ReusableText text="How many do you have?" family="bold" size={26} color={TEXT} />
          <View style={{ height: 48 }} />
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setQuantity((q) => Math.max(0, q - 1))}
            >
              <ReusableText text="−" family="bold" size={28} color={TEXT} />
            </TouchableOpacity>
            <ReusableText text={String(quantity)} family="bold" size={56} color={TEXT} />
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setQuantity((q) => q + 1)}
            >
              <ReusableText text="+" family="bold" size={28} color={TEXT} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Photo ── */}
      {step === "photo" && (
        <View style={styles.body}>
          <ReusableText text="Add photos of the part" family="bold" size={26} color={TEXT} />
          <View style={{ height: 6 }} />
          <ReusableText text="More photos help buyers trust you" family="regular" size={14} color={SUBTEXT} />
          <View style={{ height: 24 }} />

          {photoUris.length === 0 ? (
            /* No photos yet — show camera / gallery tiles */
            <View style={styles.photoArea}>
              <TouchableOpacity style={styles.photoOption} onPress={() => void addFromCamera()}>
                <Ionicons name="camera-outline" size={36} color={BLUE} />
                <View style={{ height: 8 }} />
                <ReusableText text="Camera" family="medium" size={14} color={TEXT} />
              </TouchableOpacity>
              <View style={styles.photoDivider} />
              <TouchableOpacity style={styles.photoOption} onPress={() => void addFromGallery()}>
                <Ionicons name="image-outline" size={36} color={BLUE} />
                <View style={{ height: 8 }} />
                <ReusableText text="Gallery" family="medium" size={14} color={TEXT} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Has photos — thumbnail strip + add-more tile */
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {photoUris.map((uri, idx) => (
                <View key={uri + idx} style={styles.thumbWrap}>
                  <Image source={uri} style={styles.thumb} contentFit="cover" />
                  <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(idx)}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {/* Add-more tile */}
              <TouchableOpacity style={styles.thumbAdd} onPress={promptAddMore} disabled={uploading}>
                <Ionicons name="add" size={32} color={uploading ? SUBTEXT : BLUE} />
                <View style={{ height: 4 }} />
                <ReusableText
                  text={uploading ? "Uploading…" : "Add more"}
                  family="regular"
                  size={11}
                  color={uploading ? SUBTEXT : BLUE}
                />
              </TouchableOpacity>
            </ScrollView>
          )}

          {uploading && photoUris.length === 0 && (
            <View style={{ marginTop: 12 }}>
              <ReusableText text="Uploading…" family="regular" size={13} color={SUBTEXT} />
            </View>
          )}
        </View>
      )}

      {/* ── Condition ── */}
      {step === "condition" && (
        <View style={styles.body}>
          <ReusableText text="What's the condition?" family="bold" size={26} color={TEXT} />
          <View style={{ height: 32 }} />
          {(["NEW", "USED", "REFURBISHED"] as const).map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.condOption, condition === c && styles.condOptionActive]}
              onPress={() => setCondition(c)}
            >
              <ReusableText
                text={c === "NEW" ? "New" : c === "USED" ? "Used" : "Refurbished"}
                family={condition === c ? "bold" : "regular"}
                size={16}
                color={condition === c ? BLUE : TEXT}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Success ── */}
      {step === "success" && (
        <View style={[styles.body, styles.successBody]}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-outline" size={40} color={BLUE} />
          </View>
          <View style={{ height: 20 }} />
          <ReusableText text="Part added" family="bold" size={28} color={TEXT} />
          <View style={{ height: 8 }} />
          <ReusableText text="Buyers can now see this part." family="regular" size={16} color={SUBTEXT} />
          <View style={{ height: 40 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace("AddPartWizard")}>
            <ReusableText text="Add another part" family="bold" size={16} color="#fff" />
          </TouchableOpacity>
          <View style={{ height: 12 }} />
          <TouchableOpacity onPress={() => navigation.navigate("ProductsList")}>
            <ReusableText text="Back to my parts" family="regular" size={15} color={SUBTEXT} />
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom nav */}
      {step !== "success" && (
        <View style={styles.nav}>
          {stepIndex > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={back}>
              <ReusableText text="Back" family="medium" size={16} color={SUBTEXT} />
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step === "condition" ? (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.navPrimary, saving && styles.btnDisabled]}
              onPress={save}
              disabled={saving}
            >
              <ReusableText text={saving ? "Saving…" : "Done"} family="bold" size={16} color="#fff" />
            </TouchableOpacity>
          ) : step === "photo" ? (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.navPrimary, uploading && styles.btnDisabled]}
              onPress={next}
              disabled={uploading}
            >
              <ReusableText text={photoUris.length > 0 ? "Next" : "Skip"} family="bold" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                styles.navPrimary,
                (step === "category" && !category) || (step === "name" && !name.trim()) || (step === "price" && !price)
                  ? styles.btnDisabled
                  : null,
              ]}
              onPress={next}
              disabled={
                (step === "category" && !category) ||
                (step === "name" && !name.trim()) ||
                (step === "price" && !price)
              }
            >
              <ReusableText text="Next" family="bold" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 16,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
  },
  dotActive: {
    backgroundColor: BLUE,
  },
  body: {
    flex: 1,
    paddingTop: 20,
  },
  successBody: {
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  catCard: {
    width: "46%",
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  catCardActive: {
    borderColor: BLUE,
    backgroundColor: "#EBF4FF",
  },
  nameInput: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 18,
    fontSize: 20,
    color: TEXT,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 56,
    fontFamily: "bold",
    color: TEXT,
    paddingVertical: 0,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  stepBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  photoArea: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: "hidden",
    height: 180,
    borderWidth: 1,
    borderColor: BORDER,
  },
  photoOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoDivider: {
    width: 1,
    backgroundColor: BORDER,
    marginVertical: 24,
  },
  thumbWrap: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    overflow: "visible",
  },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    padding: 1,
  },
  thumbAdd: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BLUE,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBF4FF",
  },
  condOption: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  condOptionActive: {
    borderColor: BLUE,
    backgroundColor: "#EBF4FF",
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EBF4FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BLUE,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  navPrimary: {
    flex: 2,
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
