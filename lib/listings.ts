import {
  deleteListing,
  enqueueListingOp,
  upsertBatteryListing,
  upsertFluidListing,
  upsertLightListing,
  upsertTyreListing,
  type BatteryListing,
  type FluidListing,
  type LightListing,
  type ListingKind,
  type TyreListing,
} from "./db";
import { parseJson } from "./assignment-status";

// Offline-first write helpers shared by the tyre and light screens. Every
// mutation writes the local row first (so the UI is instant) and queues the
// matching server op for the sync loop.

export function newLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function opId(op: string, listingId: string): string {
  return `${op}-${listingId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function tyrePayload(l: TyreListing): Record<string, unknown> {
  return {
    server_id: l.server_id ?? null,
    width: l.width, height: l.height, diameter: l.diameter,
    brand: l.brand, model: l.model, condition: l.condition,
    priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1,
    // Sent only when linked: the server then takes brand/model from the catalog. Omitted
    // (not null) otherwise, so an unchanged free-text edit never unlinks by accident.
    ...(l.tyre_size_id ? { tyreSizeId: l.tyre_size_id } : {}),
    // "Not in the list": ask for this tyre to be added. The server links it at once when it is already in the catalog.
    ...(l.proposed === 1 && !l.tyre_size_id ? { proposal: true } : {}),
  };
}

export function lightPayload(l: LightListing): Record<string, unknown> {
  return {
    server_id: l.server_id ?? null,
    lightType: l.light_type, side: l.side, make: l.make, model: l.model, year: l.year,
    condition: l.condition, priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1,
  };
}

export function fluidPayload(l: FluidListing): Record<string, unknown> {
  return {
    server_id: l.server_id ?? null,
    kindId: l.kind_id,
    ...(l.brand_id ? { brandId: l.brand_id } : { brandName: l.brand }),
    productName: l.product,
    grade: l.grade || null, coolantColour: l.coolant_colour || null, coolantMix: l.coolant_mix || null, sizeLabel: l.size_label,
    priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1,
    // The form refuses to save without the tick (owner: genuine only). An update only uses price, photos and stock.
    genuine: true,
  };
}

/** An update only ever changes price, photos and stock: the product is fixed once listed. */
export function fluidUpdatePayload(l: FluidListing): Record<string, unknown> {
  return { server_id: l.server_id ?? null, priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1 };
}

async function queue(kind: ListingKind, op: "create" | "update" | "delete", listingId: string, payload: Record<string, unknown>): Promise<void> {
  await enqueueListingOp(kind, {
    id: opId(op, listingId), op, listing_id: listingId,
    payload: JSON.stringify(payload), synced: 0, error: null, created_at: new Date().toISOString(),
  });
}

export async function saveTyreListing(row: TyreListing, isNew: boolean): Promise<void> {
  await upsertTyreListing(row);
  await queue("tyre", isNew ? "create" : "update", row.id, tyrePayload(row));
}

export async function saveLightListing(row: LightListing, isNew: boolean): Promise<void> {
  await upsertLightListing(row);
  await queue("light", isNew ? "create" : "update", row.id, lightPayload(row));
}

/** A REJECTED row was refused for good: it can only be deleted (discardRejectedFluid), never saved or edited. */
export async function saveFluidListing(row: FluidListing, isNew: boolean): Promise<void> {
  if (row.status === "REJECTED") throw new Error("This listing was not saved. Delete it and add it again.");
  await upsertFluidListing(row);
  await queue("fluid", isNew ? "create" : "update", row.id, isNew ? fluidPayload(row) : fluidUpdatePayload(row));
}

/**
 * The stock toggle sends ONLY inStock. A vendor whose Oils & fluids approval was withdrawn may still
 * take a listing off sale, but the server refuses any PATCH that carries price or photos.
 */
export async function setFluidStock(row: FluidListing, inStock: boolean): Promise<FluidListing> {
  if (row.status === "REJECTED") throw new Error("This listing was not saved. Delete it and add it again.");
  const next: FluidListing = { ...row, in_stock: inStock ? 1 : 0, updated_at: new Date().toISOString() };
  await upsertFluidListing(next);
  await queue("fluid", "update", row.id, { server_id: row.server_id ?? null, inStock });
  return next;
}

/** Deleting a REJECTED local row (the server never had it) only removes it here: no queued op, no server call. */
export async function discardRejectedFluid(id: string): Promise<void> {
  await deleteListing("fluid", id);
}

export async function removeListing(kind: ListingKind, id: string, serverId: string | null): Promise<void> {
  await deleteListing(kind, id);
  await queue(kind, "delete", id, { server_id: serverId });
}

export function batteryPayload(l: BatteryListing): Record<string, unknown> {
  return {
    server_id: l.server_id ?? null,
    ...(l.brand_id ? { brandId: l.brand_id } : { brandName: l.brand }),
    sizeId: l.size_id, terminal: l.terminal, voltage: l.voltage, capacityAh: l.capacity_ah, cca: l.cca, type: l.battery_type,
    priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1, warrantyMonths: l.warranty_months,
    // The form refuses to save without the tick (genuine only). An update never sends it.
    genuine: true,
  };
}

/** An update only ever changes price, photos, stock and warranty: the product is fixed once listed. */
export function batteryUpdatePayload(l: BatteryListing): Record<string, unknown> {
  return { server_id: l.server_id ?? null, priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1, warrantyMonths: l.warranty_months };
}

/** A REJECTED row was refused for good: it can only be deleted (discardRejectedBattery), never saved or edited. */
export async function saveBatteryListing(row: BatteryListing, isNew: boolean): Promise<void> {
  if (row.status === "REJECTED") throw new Error("This listing was not saved. Delete it and add it again.");
  await upsertBatteryListing(row);
  await queue("battery", isNew ? "create" : "update", row.id, isNew ? batteryPayload(row) : batteryUpdatePayload(row));
}

/** The stock toggle sends ONLY inStock: the server refuses any other field once the approval is withdrawn. */
export async function setBatteryStock(row: BatteryListing, inStock: boolean): Promise<BatteryListing> {
  if (row.status === "REJECTED") throw new Error("This listing was not saved. Delete it and add it again.");
  const next: BatteryListing = { ...row, in_stock: inStock ? 1 : 0, updated_at: new Date().toISOString() };
  await upsertBatteryListing(next);
  await queue("battery", "update", row.id, { server_id: row.server_id ?? null, inStock });
  return next;
}

/** Deleting a REJECTED local row (the server never had it) only removes it here: no queued op, no server call. */
export async function discardRejectedBattery(id: string): Promise<void> {
  await deleteListing("battery", id);
}
