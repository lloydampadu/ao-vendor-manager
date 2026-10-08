// Pure server → SQLite row mappers. No Expo imports so they are unit-testable.
import type { ApiFluidListing, ApiLightListing, ApiTyreListing } from "./api";
import type { Assignment, FluidListing, LightListing, Order, TyreListing } from "./db";

export type ApiAssignment = {
  id: string;
  requestId: string;
  status: string;
  notifiedAt: string | null;
  updatedAt: string;
  request: { status?: string; [key: string]: unknown };
  quote: { status?: string; [key: string]: unknown } | null;
};

export type ApiPayout = {
  status: "UNPAID" | "PAID";
  method: "MOMO" | "CASH" | null;
  amountGhs: number | null;
  paidAt: string | null;
  reference: string | null;
  note?: string | null;
};

export type ApiOrder = {
  id: string;
  fulfillmentStage: string;
  handedOverAt: string | null;
  handoverPhotos: string[];
  request: unknown;
  wonItems: { partName: string; condition: string; earnGhs: number; photos: string[] }[];
  totalEarnGhs: number;
  /** Absent from older API versions; treated as unpaid. */
  payout?: ApiPayout;
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
    payout_status: o.payout?.status ?? "UNPAID",
    payout_method: o.payout?.method ?? null,
    payout_amount_ghs: o.payout?.amountGhs ?? null,
    payout_at: o.payout?.paidAt ?? null,
    payout_ref: o.payout?.reference ?? null,
  };
}

/** Totals for the Orders header, computed from the local rows. */
export function earningsSummary(orders: Pick<Order, "total_earn_ghs" | "payout_status" | "payout_amount_ghs" | "stage">[]) {
  let earned = 0, paid = 0, owed = 0;
  for (const o of orders) {
    earned += o.total_earn_ghs;
    if (o.payout_status === "PAID") paid += o.payout_amount_ghs ?? o.total_earn_ghs;
    else if (o.stage === "HANDED_OVER") owed += o.total_earn_ghs;
  }
  return { earnedGhs: earned, paidGhs: paid, owedGhs: owed };
}

export function payoutLabel(o: Pick<Order, "payout_status" | "payout_method" | "payout_at" | "stage">): { text: string; tone: "paid" | "owed" | "muted" } {
  if (o.payout_status === "PAID") {
    const method = o.payout_method === "MOMO" ? "MoMo" : o.payout_method === "CASH" ? "cash" : "";
    const date = o.payout_at ? new Date(o.payout_at).toLocaleDateString([], { day: "numeric", month: "short" }) : "";
    return { text: `Paid${method ? ` by ${method}` : ""}${date ? ` on ${date}` : ""}`, tone: "paid" };
  }
  if (o.stage === "HANDED_OVER") return { text: "Payout pending", tone: "owed" };
  return { text: "Paid after collection", tone: "muted" };
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
    tyre_size_id: l.tyreSizeId ?? null,
    price_advice: l.priceAdvice ? JSON.stringify(l.priceAdvice) : null,
    proposed: l.proposedAt && !l.tyreSizeId ? 1 : 0,
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

export function mapFluid(l: ApiFluidListing): FluidListing {
  return {
    id: l.id, server_id: l.id, fluid_product_id: l.fluidProductId,
    kind_id: l.product.kindId, kind: l.product.kind, brand_id: l.product.brandId, brand: l.product.brand, product: l.product.name,
    grade: l.product.grade ?? "", coolant_colour: l.product.coolantColour ?? "", coolant_mix: l.product.coolantMix ?? "",
    size_label: l.product.sizeLabel, status: l.product.status, review_status: l.reviewStatus,
    hidden: l.hidden ? 1 : 0, hidden_reason: l.hidden ? l.hiddenReason ?? null : null,
    price_ghs: l.priceGhs, photos: JSON.stringify(l.photos ?? []), in_stock: l.inStock ? 1 : 0,
    price_advice: l.priceAdvice ? JSON.stringify(l.priceAdvice) : null, updated_at: l.updatedAt,
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
