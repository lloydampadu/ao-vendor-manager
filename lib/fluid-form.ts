// Pure state and option lists for the Oils & fluids form. Every field is a dropdown from the cached
// catalog; "Not in the list" lets the vendor type only a brand or a product line.
import type { ApiFluidCatalog } from "./api";
import type { FluidListing } from "./db";
import { linesFor, type FluidPick } from "./fluid-catalog";

export const NOT_LISTED = "Not in the list";
export const NO_GRADE = "No grade";
export const ALREADY_LISTED_MESSAGE = "You already list this. Edit your existing listing.";

type Kind = ApiFluidCatalog["kinds"][number];

export const emptyPick = (): FluidPick => ({ kindId: "", brandId: null, brandName: "", product: "", grade: "", colour: "", mix: "", size: "", genuine: false });

/** A new kind clears everything that depended on it. */
export const chooseKind = (_p: FluidPick, kindId: string): FluidPick => ({ ...emptyPick(), kindId });

/** A new brand (or null for "Not in the list") clears the product and the genuine tick, which named the old brand. */
export const chooseBrand = (p: FluidPick, brandId: string | null): FluidPick => ({ ...p, brandId, brandName: "", product: "", genuine: false });

export const typedProduct = (p: FluidPick, product: string): FluidPick => ({ ...p, product });

export const brandOptions = (c: ApiFluidCatalog): string[] => [...c.brands.map((b) => b.name), NOT_LISTED];

export const productOptions = (c: ApiFluidCatalog, p: FluidPick): string[] => [...linesFor(c, p.kindId, p.brandId), NOT_LISTED];

/** A kind whose grade is optional gets a "No grade" choice. */
export const gradeOptions = (k: Kind): string[] => [...(k.gradeRequired ? [] : [NO_GRADE]), ...k.grades];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Drops picks that are no longer valid after the catalog or the vendor's approvals changed (a fresh
 * catalog arrives, or an approval is withdrawn). Returns the same object when nothing changed.
 * `lineTyped` says the product was typed ("Not in the list"), so it is not looked up in the catalog.
 */
export function reconcilePick(c: ApiFluidCatalog, approvedKinds: readonly { id: string }[], pick: FluidPick, lineTyped = false): FluidPick {
  const kind = c.kinds.find((k) => k.id === pick.kindId);
  if (pick.kindId && (!kind || !approvedKinds.some((k) => k.id === pick.kindId))) return emptyPick();
  let next = pick;
  if (pick.brandId && !c.brands.some((b) => b.id === pick.brandId)) next = chooseBrand(next, null);
  if (next.brandId && next.product && !lineTyped && !linesFor(c, next.kindId, next.brandId).includes(next.product)) next = { ...next, product: "" };
  if (next.grade && !kind?.grades.includes(next.grade)) next = { ...next, grade: "" };
  if (next.colour && !(kind?.coolant && c.coolantColours.some((x) => x.value === next.colour))) next = { ...next, colour: "" };
  if (next.mix && !(kind?.coolant && c.coolantMixes.some((x) => x.value === next.mix))) next = { ...next, mix: "" };
  if (next.size && !c.sizes.some((s) => s.label === next.size)) next = { ...next, size: "" };
  return next;
}

/** The vendor's own live listing of exactly this product, so a duplicate sends them to edit it instead. */
export function findExistingFluid(rows: readonly FluidListing[], p: FluidPick): FluidListing | null {
  return rows.find((r) =>
    r.status !== "REJECTED" && r.kind_id === p.kindId && r.grade === p.grade && r.coolant_colour === p.colour && r.coolant_mix === p.mix && r.size_label === p.size
    && same(r.product, p.product)
    && (p.brandId ? r.brand_id === p.brandId : r.brand_id === null && same(r.brand, p.brandName)),
  ) ?? null;
}
