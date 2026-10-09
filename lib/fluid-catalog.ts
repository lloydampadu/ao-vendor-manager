// Pure helpers for the Oils & fluids form (spec 4c.1): every field is a dropdown from the cached
// catalog; only the brand and product line may be typed ("Not in the list"). The server checks the
// same rules; checking here gives the vendor the message before anything is queued.
import type { ApiFluidCatalog } from "./api";
import type { FluidListing } from "./db";

export type FluidPick = { kindId: string; brandId: string | null; brandName: string; product: string; grade: string; colour: string; mix: string; size: string; genuine: boolean };

export const kindOf = (c: ApiFluidCatalog, kindId: string) => c.kinds.find((k) => k.id === kindId) ?? null;

export function linesFor(c: ApiFluidCatalog, kindId: string, brandId: string | null): string[] {
  if (!brandId) return [];
  return c.lines.filter((l) => l.kindId === kindId && l.brandId === brandId).map((l) => l.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function pickProblem(c: ApiFluidCatalog, p: FluidPick): string | null {
  const kind = kindOf(c, p.kindId);
  if (!kind) return "Choose what kind of product it is.";
  const brand = p.brandId ? c.brands.find((b) => b.id === p.brandId)?.name : p.brandName.trim();
  if (!brand || brand.length < 2) return "Choose the brand, or type it in full.";
  if (!p.product.trim()) return "Choose the product, or type its name.";
  if (kind.gradeRequired && !p.grade) return "Choose the grade.";
  if (p.grade && !kind.grades.includes(p.grade)) return "Choose a grade from the list.";
  if (kind.coolant && (!p.colour || !p.mix)) return "Choose the coolant colour and mix.";
  if (!p.size || !c.sizes.some((s) => s.label === p.size)) return "Choose the size.";
  if (!p.genuine) return `Tick "This is genuine ${brand}" to list it.`;
  return null;
}

type TitleRow = Pick<FluidListing, "brand" | "product" | "grade" | "coolant_colour" | "coolant_mix" | "size_label">;

/** The same title customers see: "Prestone Antifreeze · Red / pink · Ready-mixed · 1 gal". */
export function fluidListingTitle(l: TitleRow, c?: ApiFluidCatalog | null): string {
  const colour = l.coolant_colour ? c?.coolantColours.find((x) => x.value === l.coolant_colour)?.label ?? l.coolant_colour : null;
  const mix = l.coolant_mix ? c?.coolantMixes.find((x) => x.value === l.coolant_mix)?.label ?? l.coolant_mix : null;
  return [`${l.brand} ${l.product}`, l.grade || null, colour, mix, l.size_label].filter(Boolean).join(" · ");
}

/** What the vendor needs to know about a listing customers can't see yet (shared with batteries). */
export { listingNote as fluidNote } from "./listing-note";
