import type { Ionicons } from "@expo/vector-icons";
import { PART_CATEGORIES } from "./parts-catalog";
import { TILES } from "./part-tiles";

// One approval rule (the server enforces the same): a vendor posts only what is
// on their approved list (vendor.specialties). "Tyres" is one entry (tyres have
// no list of types); lamps are a group of types like any other ("Tail Light").
// An older "Lamps" entry still means every lamp. Anything else is asked for and
// an admin approves it.

export const TYRES = "Tyres";
export const LAMPS = "Lamps";
export const OILS_FLUIDS = "Oils & fluids";
export const BATTERIES = "Batteries";
/** The catalog part "Battery": a vendor approved for it already sells batteries (the server agrees). */
export const BATTERY_PART = "Battery";

/** Spelling- and case-insensitive key; must match the server's approvalKey. */
export function approvalKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isApproved(list: readonly string[], item: string): boolean {
  const k = approvalKey(item);
  return list.some((s) => approvalKey(s) === k);
}

/** "Oils & fluids" covers every kind; a single kind ("Engine oil") covers itself. Same rule as the server. */
export function canListFluidKind(specialties: readonly string[], kindName: string): boolean {
  return isApproved(specialties, OILS_FLUIDS) || isApproved(specialties, kindName);
}

export function approvedFluidKinds<K extends { name: string }>(specialties: readonly string[], kinds: readonly K[]): K[] {
  return kinds.filter((k) => canListFluidKind(specialties, k.name));
}

export function canListBatteries(specialties: readonly string[]): boolean {
  return isApproved(specialties, BATTERIES) || isApproved(specialties, BATTERY_PART);
}

const LAMP_PARTS = PART_CATEGORIES[LAMPS] ?? [];

/** Lamp types the vendor may post: every lamp with "Lamps", else only the approved ones. */
export function approvedLampTypes(specialties: readonly string[]): string[] {
  if (isApproved(specialties, LAMPS)) return LAMP_PARTS;
  return LAMP_PARTS.filter((t) => isApproved(specialties, t));
}

/** Catalog part types in one group (e.g. "Body") the vendor may post. */
export function approvedTypesIn(category: string, specialties: readonly string[]): string[] {
  return (PART_CATEGORIES[category] ?? []).filter((t) => isApproved(specialties, t));
}

export type ProductKind = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  form: "tyre" | "lamp" | "part" | "fluid" | "battery";
  /** PART_CATEGORIES key for part kinds. */
  partCategory?: string;
};

/**
 * What the vendor may add, in tile order: Tyres, Lamps, Oils & fluids and each part group with an
 * approved part. `fluidKindNames` are the cached kinds, so a vendor approved for one kind gets the tile.
 */
export function approvedKinds(specialties: readonly string[], fluidKindNames: readonly string[] = []): ProductKind[] {
  const out: ProductKind[] = [];
  for (const t of TILES) {
    if (t.vendorCategory === "TYRES") {
      if (isApproved(specialties, TYRES)) out.push({ key: "tyres", label: t.label, icon: t.icon, form: "tyre" });
    } else if (t.vendorCategory === "LAMPS") {
      if (approvedLampTypes(specialties).length > 0) out.push({ key: "lamps", label: t.label, icon: t.icon, form: "lamp" });
    } else if (t.vendorCategory === "OILS_FLUIDS") {
      if (isApproved(specialties, OILS_FLUIDS) || fluidKindNames.some((k) => isApproved(specialties, k))) out.push({ key: "fluids", label: t.label, icon: t.icon, form: "fluid" });
    } else if (t.vendorCategory === "BATTERIES") {
      if (canListBatteries(specialties)) out.push({ key: "batteries", label: t.label, icon: t.icon, form: "battery" });
    } else if (t.partCategory && approvedTypesIn(t.partCategory, specialties).length > 0) {
      out.push({ key: t.partCategory, label: t.label, icon: t.icon, form: "part", partCategory: t.partCategory });
    }
  }
  return out;
}

/** Brands don't apply to tyres or oils (they fit any car), so a vendor selling only those skips that step. */
export function needsBrandsStep(specialties: readonly string[]): boolean {
  return !(specialties.length > 0 && specialties.every((s) => [TYRES, OILS_FLUIDS, BATTERIES].some((x) => approvalKey(s) === approvalKey(x))));
}

/** The kind to open straight away, only once the cached fluid kinds are read (they can add a second kind). */
export function autoOpenKind(kinds: readonly ProductKind[], fluidKindsLoaded: boolean): ProductKind | null {
  return fluidKindsLoaded ? onlyKind(kinds) : null;
}

/** "What are you adding?" is skipped when there is exactly one kind to add. */
export function onlyKind(kinds: readonly ProductKind[]): ProductKind | null {
  return kinds.length === 1 ? kinds[0] : null;
}

export type RequestSection = { title: string; items: string[] };

/**
 * What can still be asked for, grouped for the request sheet: Tyres first, then
 * each catalog group (Lamps included). Approved and waiting items are left out.
 * `category` narrows it to one group.
 */
export function requestableSections(specialties: readonly string[], pending: readonly string[], category?: string, fluidKindNames: readonly string[] = []): RequestSection[] {
  const open = (item: string) => !isApproved(specialties, item) && !isApproved(pending, item);
  const sections: RequestSection[] = [];
  if (!category) {
    if (open(TYRES)) sections.push({ title: "Tyres", items: [TYRES] });
    // Asking for the whole family, or for one kind; the family covers every kind, so it hides them once approved.
    if (open(OILS_FLUIDS)) sections.push({ title: OILS_FLUIDS, items: [OILS_FLUIDS, ...fluidKindNames.filter(open)] });
    if (open(BATTERIES) && !canListBatteries(specialties)) sections.push({ title: BATTERIES, items: [BATTERIES] });
  }
  for (const [title, parts] of Object.entries(PART_CATEGORIES)) {
    if (category && title !== category) continue;
    // An older "Lamps" entry (approved or asked for) already covers every lamp.
    if (title === LAMPS && !open(LAMPS)) continue;
    const items = parts.filter(open);
    if (items.length) sections.push({ title, items });
  }
  return sections;
}

/** The catalog group an item belongs to (sent with the request), or the item itself for whole kinds. */
export function groupOf(item: string): string {
  if (item === TYRES || item === LAMPS || item === OILS_FLUIDS || item === BATTERIES) return item;
  for (const [title, parts] of Object.entries(PART_CATEGORIES)) if (parts.includes(item)) return title;
  return "Other";
}
