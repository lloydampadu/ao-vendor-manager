import type { Ionicons } from "@expo/vector-icons";

export type CategoryTile = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Key into PART_CATEGORIES; null for Tyres and Lamps, which have their own forms. */
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

/**
 * The catalog name the server matched a customer's words to ("ABS module" →
 * "Anti-Lock Brake Computer"), shown under them. Null when it adds nothing.
 */
export function catalogNameLine(partName: string, catalogPart?: string | null): string | null {
  if (!catalogPart) return null;
  return catalogPart.trim().toLowerCase() === partName.trim().toLowerCase() ? null : `Also called ${catalogPart}`;
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
