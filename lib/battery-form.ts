// Pure state and checks for the battery form (spec 4e.4): brand → size code → terminal side → type,
// from the cached catalog. "Not in the list" is only for a brand; a brand + size + side the catalog
// doesn't have yet is a new battery, and the vendor reads its figures off the label. The server
// checks the same rules; checking here gives the vendor the message before anything is queued.
import type { ApiBatteryCatalog } from "./api";
import type { BatteryListing } from "./db";

export type BatteryPick = {
  brandId: string | null; brandName: string; sizeId: string; terminal: "" | "LEFT" | "RIGHT";
  type: string; voltage: number; capacityAh: string; cca: string; warranty: string; genuine: boolean;
};

export const NOT_LISTED = "Not in the list";
export const ALREADY_LISTED_MESSAGE = "You already list this. Edit your existing listing.";

export const emptyBatteryPick = (): BatteryPick =>
  ({ brandId: null, brandName: "", sizeId: "", terminal: "", type: "", voltage: 12, capacityAh: "", cca: "", warranty: "", genuine: false });

export const brandOptions = (c: ApiBatteryCatalog): string[] => [...c.brands.map((b) => b.name), NOT_LISTED];

/** A new brand (or null for "Not in the list") clears the genuine tick, which named the old brand. */
export const chooseBrand = (p: BatteryPick, brandId: string | null): BatteryPick => ({ ...p, brandId, brandName: "", genuine: false });

/** Label figures belong to one battery: any change above them starts them again (the catalog refills a known one). */
const clearFigures = (p: BatteryPick): BatteryPick => ({ ...p, type: "", voltage: 12, capacityAh: "", cca: "" });

/** A new brand clears the size, side and figures that followed it. */
export const pickBrand = (p: BatteryPick, brandId: string | null): BatteryPick => clearFigures({ ...chooseBrand(p, brandId), sizeId: "", terminal: "" });
/** A new size clears the side and figures that followed it. */
export const pickSize = (p: BatteryPick, sizeId: string): BatteryPick => clearFigures({ ...p, sizeId, terminal: "" });
/** A new side clears the figures, which belong to one battery. */
export const pickTerminal = (p: BatteryPick, terminal: BatteryPick["terminal"]): BatteryPick => clearFigures({ ...p, terminal });

export function catalogProductFor(c: ApiBatteryCatalog, p: BatteryPick): ApiBatteryCatalog["products"][number] | null {
  if (!p.brandId || !p.sizeId || !p.terminal) return null;
  return c.products.find((x) => x.brandId === p.brandId && x.sizeId === p.sizeId && x.terminal === p.terminal) ?? null;
}

/** A battery in the catalog brings its own figures; the vendor only types them for a new one. */
export function withCatalogFigures(c: ApiBatteryCatalog, p: BatteryPick): BatteryPick {
  const known = catalogProductFor(c, p);
  return known ? { ...p, type: known.type, voltage: known.voltage, capacityAh: String(known.capacityAh), cca: known.cca?.toString() ?? "" } : p;
}

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** The label's figures for a battery not in the list: the same rules and words as the server. */
function figuresProblem(c: ApiBatteryCatalog, p: BatteryPick): string | null {
  if (!c.voltages.includes(p.voltage)) return "Choose 12V or 24V.";
  const ah = whole(p.capacityAh);
  if (!(ah >= 20 && ah <= 250)) return "Enter the capacity in Ah, from 20 to 250.";
  if (p.cca.trim()) { const cca = whole(p.cca); if (!(cca >= 100 && cca <= 1500)) return "Enter the CCA from 100 to 1500, or leave it empty."; }
  if (!c.types.some((t) => t.value === p.type)) return "Choose the battery type.";
  return null;
}

export function warrantyProblem(warranty: string, max: number): string | null {
  const m = whole(warranty);
  return m >= 0 && m <= max ? null : `Enter the warranty in months, from 0 to ${max}.`;
}

export function batteryPickProblem(c: ApiBatteryCatalog, p: BatteryPick): string | null {
  const brand = p.brandId ? c.brands.find((b) => b.id === p.brandId)?.name : p.brandName.trim();
  if (!brand || brand.length < 2) return "Choose the brand, or type it in full.";
  if (!p.sizeId || !c.sizes.some((s) => s.id === p.sizeId)) return "Choose the size code.";
  if (!p.terminal) return "Choose the side of the positive terminal.";
  if (!catalogProductFor(c, p)) {
    const problem = figuresProblem(c, p);
    if (problem) return `This battery isn't in our list yet. ${problem}`;
  }
  const warranty = warrantyProblem(p.warranty, c.warrantyMaxMonths);
  if (warranty) return warranty;
  if (!p.genuine) return `Tick "This is a genuine ${brand} battery" to list it.`;
  return null;
}

/** Drops picks a fresh catalog no longer has. Returns the same object when nothing changed. */
export function reconcileBatteryPick(c: ApiBatteryCatalog, p: BatteryPick): BatteryPick {
  let next = p;
  if (next.brandId && !c.brands.some((b) => b.id === next.brandId)) next = chooseBrand(next, null);
  if (next.sizeId && !c.sizes.some((s) => s.id === next.sizeId)) next = { ...next, sizeId: "" };
  if (next.type && !c.types.some((t) => t.value === next.type)) next = { ...next, type: "" };
  return next;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The vendor's own live listing of exactly this battery, so a duplicate sends them to edit it instead. */
export function findExistingBattery(rows: readonly BatteryListing[], p: BatteryPick): BatteryListing | null {
  return rows.find((r) =>
    r.status !== "REJECTED" && r.size_id === p.sizeId && r.terminal === p.terminal
    && (p.brandId ? r.brand_id === p.brandId : r.brand_id === null && same(r.brand, p.brandName)),
  ) ?? null;
}

/** The title customers see: "Varta NS60 · 12V 45Ah · 330 CCA · Positive on the left". */
export function batteryListingTitle(l: Pick<BatteryListing, "brand" | "size_code" | "voltage" | "capacity_ah" | "cca" | "terminal">): string {
  return [`${l.brand} ${l.size_code}`, `${l.voltage}V ${l.capacity_ah}Ah`, l.cca ? `${l.cca} CCA` : null, l.terminal === "LEFT" ? "Positive on the left" : "Positive on the right"]
    .filter(Boolean).join(" · ");
}
