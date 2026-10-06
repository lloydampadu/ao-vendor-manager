import type { Ionicons } from "@expo/vector-icons";
import { PART_CATEGORIES, normaliseVendorCategory } from "./parts-catalog";

export type CategoryTile = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Key into PART_CATEGORIES; null for kinds with their own listing screen. */
  partCategory: string | null;
  /** VendorCategory enum value stored on vendor.categories. */
  vendorCategory: string;
};

export const TILES: CategoryTile[] = [
  { label: "Body",         icon: "car-outline",              partCategory: "Body",                  vendorCategory: "BODY" },
  { label: "Engine",       icon: "settings-outline",         partCategory: "Engine",                vendorCategory: "ENGINE" },
  { label: "Brakes",       icon: "disc-outline",             partCategory: "Axle & Brakes",         vendorCategory: "AXLE_BRAKES" },
  { label: "Electrical",   icon: "flash-outline",            partCategory: "Electrical",            vendorCategory: "ELECTRICAL" },
  { label: "Tyres",        icon: "ellipse-outline",          partCategory: null,                    vendorCategory: "TYRES" },
  { label: "Lamps",        icon: "bulb-outline",             partCategory: null,                    vendorCategory: "LAMPS" },
  { label: "Suspension",   icon: "git-branch-outline",       partCategory: "Steering & Suspension", vendorCategory: "STEERING_SUSPENSION" },
  { label: "Transmission", icon: "swap-horizontal-outline",  partCategory: "Transmission",          vendorCategory: "TRANSMISSION" },
  { label: "Interior",     icon: "grid-outline",             partCategory: "Interior",              vendorCategory: "INTERIOR" },
  { label: "Glass",        icon: "tablet-landscape-outline", partCategory: "Glass",                 vendorCategory: "GLASS" },
  { label: "Cooling",      icon: "thermometer-outline",      partCategory: "Heating & Cooling",     vendorCategory: "HEATING_COOLING" },
  { label: "Air & Fuel",   icon: "flame-outline",            partCategory: "Air & Fuel",            vendorCategory: "AIR_FUEL" },
];

const PART_CAT_TO_VENDOR_CAT: Record<string, string> = {
  ...Object.fromEntries(TILES.filter((t) => t.partCategory).map((t) => [t.partCategory as string, t.vendorCategory])),
  Lamps: "LAMPS",
};

// part name → vendorCategory, so a vendor's specialties also unlock tiles.
const PART_TO_VENDOR_CATEGORY = new Map<string, string>();
for (const [partCat, parts] of Object.entries(PART_CATEGORIES)) {
  const vendorCat = PART_CAT_TO_VENDOR_CAT[partCat];
  if (vendorCat) for (const part of parts) PART_TO_VENDOR_CATEGORY.set(part, vendorCat);
}

/** Which "what are you selling" tiles a vendor with these categories/specialties sees. */
export function visibleTilesFor(categories: string[], specialties: string[]): CategoryTile[] {
  const cats = new Set(categories.map(normaliseVendorCategory));
  if (cats.size === 0 || cats.has("GENERAL")) return TILES;
  for (const s of specialties) {
    const c = PART_TO_VENDOR_CATEGORY.get(s);
    if (c) cats.add(c);
    if (s === "Tyres") cats.add("TYRES");
  }
  return TILES.filter((t) => cats.has(t.vendorCategory));
}

/** Builds the stored product name from the structured add-part fields. */
export function buildPartName(parts: { type: string; side?: string; position?: string; make?: string; model?: string; year?: string; engine?: string }): string {
  const out: string[] = [parts.type.trim()];
  if (parts.side) out.push(parts.side);
  if (parts.position) out.push(parts.position);
  const fitment = [parts.make, parts.model, parts.year].filter(Boolean).join(" ");
  if (fitment) out.push(fitment);
  if (parts.engine) out.push(parts.engine);
  return out.join(" — ");
}
