import type { BatteryListing, FluidListing, LightListing, TyreListing } from "./db";
import type { ApiProduct } from "./api";

/** Everything a vendor sells, on one list. Each kind keeps its own edit form. */
export type ProductItem =
  | { kind: "tyre"; id: string; row: TyreListing }
  | { kind: "lamp"; id: string; row: LightListing }
  | { kind: "fluid"; id: string; row: FluidListing }
  | { kind: "battery"; id: string; row: BatteryListing }
  | { kind: "part"; id: string; row: ApiProduct };

export type ProductSection = { key: string; noun: string; count: number; data: ProductItem[][] };

function rowsOfTwo<T>(list: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
  return rows;
}

/** Sections in a fixed order: Tyres, Lamps, Oils & fluids, Batteries, then each part group A–Z. Empty sections are left out. */
export function productSections(tyres: TyreListing[], lamps: LightListing[], parts: ApiProduct[], fluids: FluidListing[] = [], batteries: BatteryListing[] = []): ProductSection[] {
  const out: ProductSection[] = [];
  if (tyres.length) out.push({ key: "Tyres", noun: "tyre", count: tyres.length, data: rowsOfTwo(tyres.map((row) => ({ kind: "tyre" as const, id: `t:${row.id}`, row }))) });
  if (lamps.length) out.push({ key: "Lamps", noun: "lamp", count: lamps.length, data: rowsOfTwo(lamps.map((row) => ({ kind: "lamp" as const, id: `l:${row.id}`, row }))) });
  if (fluids.length) out.push({ key: "Oils & fluids", noun: "item", count: fluids.length, data: rowsOfTwo(fluids.map((row) => ({ kind: "fluid" as const, id: `f:${row.id}`, row }))) });
  if (batteries.length) out.push({ key: "Batteries", noun: "battery", count: batteries.length, data: rowsOfTwo(batteries.map((row) => ({ kind: "battery" as const, id: `b:${row.id}`, row }))) });
  const groups = new Map<string, ApiProduct[]>();
  for (const p of parts) {
    const k = p.category?.trim() || "Other";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const [key, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({ key, noun: "part", count: list.length, data: rowsOfTwo(list.map((row) => ({ kind: "part" as const, id: `p:${row.id}`, row }))) });
  }
  return out;
}
