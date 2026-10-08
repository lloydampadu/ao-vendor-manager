import {
  deleteListing,
  enqueueListingOp,
  upsertLightListing,
  upsertTyreListing,
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
  };
}

export function lightPayload(l: LightListing): Record<string, unknown> {
  return {
    server_id: l.server_id ?? null,
    lightType: l.light_type, side: l.side, make: l.make, model: l.model, year: l.year,
    condition: l.condition, priceGhs: l.price_ghs, photos: parseJson<string[]>(l.photos, []), inStock: l.in_stock === 1,
  };
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

export async function removeListing(kind: ListingKind, id: string, serverId: string | null): Promise<void> {
  await deleteListing(kind, id);
  await queue(kind, "delete", id, { server_id: serverId });
}
