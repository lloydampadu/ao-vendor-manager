import React from "react";
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReusableText from "./Reusable/ReusableText";
import HeightSpacer from "./Reusable/HeightSpacer";
import { SIZES, useThemeColors } from "../constants/theme";

// Small form primitives shared by the add/edit listing screens so they look and
// behave the same everywhere.

export function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const C = useThemeColors();
  return (
    <View style={styles.field}>
      <ReusableText text={label} family="bold" size={SIZES.xSmall} color={C.primary} />
      {hint ? (
        <>
          <HeightSpacer height={2} />
          <ReusableText text={hint} family="regular" size={11} color={C.gray2} />
        </>
      ) : null}
      <HeightSpacer height={6} />
      {children}
    </View>
  );
}

export function FormInput(props: TextInputProps) {
  const C = useThemeColors();
  return (
    <TextInput
      placeholderTextColor={C.gray2}
      {...props}
      style={[styles.input, { backgroundColor: C.white, borderColor: C.gray, color: C.secondary }, props.style]}
    />
  );
}

type SelectProps = {
  value: string;
  placeholder: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** A dropdown-looking button that opens a PickerModal. */
export function SelectButton({ value, placeholder, onPress, loading, disabled, accessibilityLabel }: SelectProps) {
  const C = useThemeColors();
  return (
    <TouchableOpacity
      style={[styles.select, { backgroundColor: disabled ? C.offwhite : C.white, borderColor: C.gray }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ReusableText
        text={value || placeholder}
        family="regular"
        size={SIZES.medium}
        color={value ? C.secondary : C.gray2}
        numberOfLines={1}
      />
      {loading ? <ActivityIndicator size="small" color={C.gray2} /> : <Ionicons name="chevron-down" size={16} color={C.gray2} />}
    </TouchableOpacity>
  );
}

type SegmentedProps<T extends string> = {
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
};

/** Row of equal-width toggle buttons (condition, side, position). */
export function SegmentedButtons<T extends string>({ options, value, onChange, labels }: SegmentedProps<T>) {
  const C = useThemeColors();
  return (
    <View style={styles.segRow}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.segBtn, { borderColor: C.gray, backgroundColor: C.white }, active && { backgroundColor: C.primary, borderColor: C.primary }]}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <ReusableText text={labels?.[opt] ?? opt} family="medium" size={13} color={active ? C.white : C.gray2} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function StockToggle({ inStock, onToggle }: { inStock: boolean; onToggle: () => void }) {
  const C = useThemeColors();
  return (
    <TouchableOpacity
      style={[styles.stockToggle, inStock ? styles.stockIn : styles.stockOut]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: inStock }}
    >
      <Ionicons name={inStock ? "checkmark-circle" : "close-circle"} size={20} color={inStock ? "#16a34a" : C.red} />
      <ReusableText
        text={inStock ? "In stock — tap to mark sold out" : "Sold out — tap to mark in stock"}
        family="medium"
        size={14}
        color={inStock ? "#16a34a" : C.red}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  input: {
    borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: SIZES.medium, fontFamily: "regular",
  },
  select: {
    borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8,
  },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, padding: 10, alignItems: "center" },
  stockToggle: {
    flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1,
  },
  stockIn: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  stockOut: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
});
