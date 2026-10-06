// Pure server → SQLite row mappers. No Expo imports so they are unit-testable.
import type { ApiLightListing, ApiTyreListing } from "./api";
import type { Assignment, LightListing, Order, TyreListing } from "./db";

export type ApiAssignment = {
  id: string;
  requestId: string;
  status: string;
  notifiedAt: string | null;
  updatedAt: string;
  request: { status?: string; [key: string]: unknown };
  quote: { status?: string; [key: string]: unknown } | null;
};

export type ApiOrder = {
  id: string;
  fulfillmentStage: string;
  handedOverAt: string | null;
  handoverPhotos: string[];
  request: unknown;
  wonItems: { partName: string; condition: string; earnGhs: number; photos: string[] }[];
  totalEarnGhs: number;
};

export function mapAssignment(a: ApiAssignment): Assignment {
  return {
    id: a.id,
    request_id: a.requestId,
    status: a.status,
    notified_at: a.notifiedAt ?? null,
    updated_at: a.updatedAt,
    request_data: JSON.stringify(a.request),
    quote_data: a.quote ? JSON.stringify(a.quote) : null,
    fee_paid: a.request.status !== "AWAITING_PAYMENT" ? 1 : 0,
  };
}

export function mapOrder(o: ApiOrder, now: string): Order {
  return {
    id: o.id,
    stage: o.fulfillmentStage,
    won_items: JSON.stringify(o.wonItems),
    total_earn_ghs: o.totalEarnGhs,
    request_data: JSON.stringify(o.request),
    handed_over_at: o.handedOverAt,
    handover_photos: JSON.stringify(o.handoverPhotos ?? []),
    updated_at: now,
  };
}

export function mapTyre(l: ApiTyreListing): TyreListing {
  return {
    id: l.id,
    server_id: l.id,
    width: l.width,
    height: l.height,
    diameter: l.diameter,
    brand: l.brand ?? "",
    model: l.model ?? "",
    condition: l.condition,
    price_ghs: l.priceGhs,
    photos: JSON.stringify(l.photos ?? []),
    in_stock: l.inStock ? 1 : 0,
    updated_at: l.updatedAt,
  };
}

export function mapLight(l: ApiLightListing): LightListing {
  return {
    id: l.id,
    server_id: l.id,
    light_type: l.lightType,
    side: l.side,
    make: l.make ?? "",
    model: l.model ?? "",
    year: l.year ?? "",
    condition: l.condition,
    price_ghs: l.priceGhs,
    photos: JSON.stringify(l.photos ?? []),
    in_stock: l.inStock ? 1 : 0,
    updated_at: l.updatedAt,
  };
}

/**
 * Merges a freshly pulled assignment with the local row. While a quote or
 * decline is still queued, the local optimistic status wins over the server's
 * stale PENDING so the UI never invites a duplicate action.
 */
export function mergeAssignment(server: Assignment, local: Assignment | null, hasPendingAction: boolean): Assignment {
  if (hasPendingAction && server.status === "PENDING" && local) {
    return { ...server, status: local.status, quote_data: local.quote_data };
  }
  return server;
}
