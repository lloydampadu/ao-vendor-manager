import { Dimensions, useColorScheme } from "react-native";
const { height, width } = Dimensions.get("window");

export const LIGHT_COLORS = {
  primary:    "#0060C0",
  primary1:   "#0060C01A",
  secondary:  "#001020",
  secondary1: "#E8F0FA",
  gray:       "#E0E0E0",
  gray2:      "#888899",
  offwhite:   "#F3F4F8",
  white:      "#FFFFFF",
  black:      "#000000",
  red:        "#E63946",
  green:      "#00C135",
  lightWhite: "#FAFAFC",
};

export const DARK_COLORS = {
  primary:    "#4A9EE0",
  primary1:   "#4A9EE025",
  secondary:  "#E8EEFF",
  secondary1: "#1A2A3A",
  gray:       "#2E3040",
  gray2:      "#9090A8",
  offwhite:   "#10121C",
  white:      "#1C1F2E",
  black:      "#FFFFFF",
  red:        "#FF6B75",
  green:      "#34D399",
  lightWhite: "#161829",
};

// Static export kept for components that can't use hooks (StyleSheet module level).
// These are the light values — screens override with useThemeColors() where needed.
export const COLORS = LIGHT_COLORS;

export function useThemeColors() {
  const scheme = useColorScheme();
  return scheme === "dark" ? DARK_COLORS : LIGHT_COLORS;
}

export const SIZES = {
  xSmall: 10,
  small:  12,
  medium: 16,
  large:  20,
  xLarge: 24,
  xxLarge: 44,
  height,
  width,
};

export const SHADOWS = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5.84,
    elevation: 5,
  },
};
