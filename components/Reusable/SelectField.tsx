import React, { useState } from "react";
import { FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ReusableText, HeightSpacer } from "../index";
import { SIZES, useThemeColors } from "../../constants/theme";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  disabled?: boolean;
};

export default function SelectField({
  label, value, onChange, options, placeholder, keyboardType = "default", disabled,
}: Props): React.JSX.Element {
  const C = useThemeColors();
  const [open, setOpen] = useState(false);
  // Explicit "Other…" selection. Custom entry also kicks in when there are no
  // options to pick from (empty catalog) or the current value isn't in the list
  // (legacy free-typed data), so a vendor is never blocked.
  const [customChosen, setCustomChosen] = useState(false);
  const showCustomInput =
    options.length === 0 || customChosen || (value !== "" && !options.includes(value));

  return (
    <View style={styles.field}>
      <ReusableText text={label} family="bold" size={SIZES.xSmall} color={C.primary} />
      <HeightSpacer height={6} />

      {showCustomInput ? (
        <View style={styles.customRow}>
          <TextInput
            style={[styles.input, styles.flex1, { backgroundColor: C.white, borderColor: C.gray, color: C.secondary }]}
            value={value}
            onChangeText={onChange}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={C.gray2}
            editable={!disabled}
          />
          {options.length > 0 && (
            <TouchableOpacity
              style={[styles.backToList, { borderColor: C.gray }]}
              onPress={() => { setCustomChosen(false); onChange(""); }}
            >
              <Ionicons name="list" size={20} color={C.primary} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.input, styles.selectRow, { backgroundColor: C.white, borderColor: C.gray }]}
          onPress={() => { if (!disabled) setOpen(true); }}
          disabled={disabled}
        >
          <ReusableText
            text={value || placeholder || "Select…"}
            family="regular"
            size={SIZES.medium}
            color={value ? C.secondary : C.gray2}
          />
          <Ionicons name="chevron-down" size={18} color={C.gray2} />
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: C.white }]}>
            <View style={styles.sheetHeader}>
              <ReusableText text={label} family="bold" size={SIZES.medium} color={C.primary} />
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={C.gray2} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(o) => o}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, { borderBottomColor: C.gray }]}
                  onPress={() => { onChange(item); setCustomChosen(false); setOpen(false); }}
                >
                  <ReusableText
                    text={item}
                    family={item === value ? "bold" : "regular"}
                    size={SIZES.medium}
                    color={item === value ? C.primary : C.secondary}
                  />
                  {item === value && <Ionicons name="checkmark" size={20} color={C.primary} />}
                </TouchableOpacity>
              )}
              ListFooterComponent={
                <TouchableOpacity
                  style={[styles.option, { borderBottomColor: C.gray }]}
                  onPress={() => { setCustomChosen(true); onChange(""); setOpen(false); }}
                >
                  <ReusableText text="Other…" family="medium" size={SIZES.medium} color={C.primary} />
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  flex1: { flex: 1 },
  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.medium,
    fontFamily: "regular",
  },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backToList: {
    width: 48, height: 48, borderRadius: 10, borderWidth: 1.5,
    justifyContent: "center", alignItems: "center",
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { maxHeight: "70%", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd",
  },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
