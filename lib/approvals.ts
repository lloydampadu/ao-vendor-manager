import type { Ionicons } from "@expo/vector-icons";
import { PART_CATEGORIES } from "./parts-catalog";
import { TILES } from "./part-tiles";

// One approval rule (the server enforces the same): a vendor posts only what is
// on their approved list (vendor.specialties). Tyres and Lamps are entries on
// that list like any part; a specific lamp part ("Tail Light") also lets them
// post lamps of that type. Anything else is asked for and an admin approves it.

export const TYRES = "Tyres";
export const LAMPS = "Lamps";

/** Spelling- and case-insensitive key; must match the server's approvalKey. */
export function approvalKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isApproved(list: readonly string[], item: string): boolean {
  const k = approvalKey(item);
  return list.some((s) => approvalKey(s) === k);
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
  form: "tyre" | "lamp" | "part";
  /** PART_CATEGORIES key for part kinds. */
  partCategory?: string;
};

/** What the vendor may add, in tile order: Tyres, Lamps and each part group with an approved part. */
export function approvedKinds(specialties: readonly string[]): ProductKind[] {
  const out: ProductKind[] = [];
  for (const t of TILES) {
    if (t.vendorCategory === "TYRES") {
      if (isApproved(specialties, TYRES)) out.push({ key: "tyres", label: t.label, icon: t.icon, form: "tyre" });
    } else if (t.vendorCategory === "LAMPS") {
      if (approvedLampTypes(specialties).length > 0) out.push({ key: "lamps", label: t.label, icon: t.icon, form: "lamp" });
    } else if (t.partCategory && approvedTypesIn(t.partCategory, specialties).length > 0) {
      out.push({ key: t.partCategory, label: t.label, icon: t.icon, form: "part", partCategory: t.partCategory });
    }
  }
  return out;
}

/** Brands don't apply to tyres (they fit any car), so a tyres-only vendor skips that step. */
export function needsBrandsStep(specialties: readonly string[]): boolean {
  return !(specialties.length > 0 && specialties.every((s) => approvalKey(s) === approvalKey(TYRES)));
}

/** "What are you adding?" is skipped when there is exactly one kind to add. */
export function onlyKind(kinds: readonly ProductKind[]): ProductKind | null {
  return kinds.length === 1 ? kinds[0] : null;
}

export type RequestSection = { title: string; items: string[] };

/**
 * What can still be asked for, grouped for the request sheet: the whole kinds
 * first (Tyres, Lamps), then each catalog group. Approved and waiting items are
 * left out. `category` narrows it to one group.
 */
export function requestableSections(specialties: readonly string[], pending: readonly string[], category?: string): RequestSection[] {
  const open = (item: string) => !isApproved(specialties, item) && !isApproved(pending, item);
  const sections: RequestSection[] = [];
  if (!category) {
    const whole = [TYRES, LAMPS].filter(open);
    if (whole.length) sections.push({ title: "Whole kinds", items: whole });
  }
  for (const [title, parts] of Object.entries(PART_CATEGORIES)) {
    if (category && title !== category) continue;
    // Every lamp is covered by "Lamps" once approved or asked for.
    if (title === LAMPS && !open(LAMPS)) continue;
    const items = parts.filter(open);
    if (items.length) sections.push({ title, items });
  }
  return sections;
}

/** The catalog group an item belongs to (sent with the request), or the item itself for whole kinds. */
export function groupOf(item: string): string {
  if (item === TYRES || item === LAMPS) return item;
  for (const [title, parts] of Object.entries(PART_CATEGORIES)) if (parts.includes(item)) return title;
  return "Other";
}
