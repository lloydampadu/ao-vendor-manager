import React from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import { useThemeColors } from "../constants/theme";
import type { PhotoEntry } from "@/hooks/usePhotoUpload";

type Props = {
  photos: PhotoEntry[];
  canAddMore: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  size?: number;
};

/** Thumbnail strip with upload/deferred state and an add-photo tile. */
export function PhotoGrid({ photos, canAddMore, onAdd, onRemove, size = 80 }: Props): React.JSX.Element {
  const C = useThemeColors();
  const uploading = photos.some((p) => p.url === null);
  return (
    <View style={styles.grid}>
      {photos.map((p, i) => (
        <View key={`${p.localUri}-${i}`} style={styles.wrap}>
          <Image source={p.localUri} style={{ width: size, height: size, borderRadius: 8 }} contentFit="cover" cachePolicy="disk" />
          {p.url === null && (
            <View style={[styles.overlay, { borderRadius: 8 }]}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
          {p.deferred && (
            <View style={[styles.deferredTag, { backgroundColor: C.secondary }]}>
              <Ionicons name="cloud-upload-outline" size={10} color={C.white} />
              <ReusableText text=" later" family="medium" size={9} color={C.white} />
            </View>
          )}
          <TouchableOpacity
            style={styles.remove}
            onPress={() => onRemove(i)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close-circle" size={20} color={C.red} />
          </TouchableOpacity>
        </View>
      ))}
      {canAddMore && (
        <TouchableOpacity
          style={[styles.add, { width: size, height: size, borderColor: C.primary, backgroundColor: C.primary1 }]}
          onPress={onAdd}
          disabled={uploading}
          accessibilityLabel="Take a photo"
        >
          {uploading ? <ActivityIndicator color={C.primary} /> : <Ionicons name="camera-outline" size={28} color={C.primary} />}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  wrap: { position: "relative" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  deferredTag: {
    position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, opacity: 0.9,
  },
  remove: { position: "absolute", top: -6, right: -6, backgroundColor: "#fff", borderRadius: 10 },
  add: { borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
});
