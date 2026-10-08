// Pure helpers for picking a tyre from the shared catalog and for explaining
// the price band. No React, no I/O, so they are unit-tested directly.

export type CatalogChoice = { sizeId: string; brand: string; model: string };
export type PriceAdvice = { lowestGhs: number; maxGhs: number };

type CatalogResponse = { brands: { brandName: string; models: { sizeId: string; modelName: string }[] }[] };

/** Flatten GET /tyres/sizes/:w/:h/:d into one choice per catalog size row. */
export function catalogChoices(resp: CatalogResponse): CatalogChoice[] {
  return resp.brands.flatMap((b) => b.models.map((m) => ({ sizeId: m.sizeId, brand: b.brandName, model: m.modelName })));
}

/** Distinct brand names, alphabetical. */
export function brandsOf(choices: CatalogChoice[]): string[] {
  return [...new Set(choices.map((c) => c.brand))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Choices for one brand, in catalog order. */
export function modelsOf(choices: CatalogChoice[], brand: string): CatalogChoice[] {
  return choices.filter((c) => c.brand === brand);
}

/** Vendor-facing note when the price is above the band. Never names another vendor. */
export function priceNote(advice: PriceAdvice | null): string | null {
  if (!advice) return null;
  return `Other vendors sell this for GHS ${advice.lowestGhs}. Price it at GHS ${advice.maxGhs} or less to get orders.`;
}

/** price_advice is stored as JSON text in SQLite; anything malformed means "no advice". */
export function parsePriceAdvice(raw: string | null | undefined): PriceAdvice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PriceAdvice> | null;
    if (v && typeof v.lowestGhs === "number" && typeof v.maxGhs === "number") return { lowestGhs: v.lowestGhs, maxGhs: v.maxGhs };
  } catch { /* fall through */ }
  return null;
}
