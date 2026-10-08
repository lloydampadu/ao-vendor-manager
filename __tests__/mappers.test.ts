import { earningsSummary, mapAssignment, mapFluid, mapLight, mapOrder, mapTyre, mergeAssignment, payoutLabel, type ApiAssignment } from "@/lib/mappers";
import type { Assignment } from "@/lib/db";

const serverAssignment: ApiAssignment = {
  id: "a1",
  requestId: "r1",
  status: "PENDING",
  notifiedAt: null,
  updatedAt: "2026-10-01T00:00:00Z",
  request: { partName: "Brake pads", status: "OPEN" },
  quote: null,
};

describe("mapAssignment", () => {
  it("serialises blobs and derives fee_paid", () => {
    const row = mapAssignment(serverAssignment);
    expect(row.id).toBe("a1");
    expect(JSON.parse(row.request_data)).toEqual({ partName: "Brake pads", status: "OPEN" });
    expect(row.quote_data).toBeNull();
    expect(row.fee_paid).toBe(1);
  });

  it("marks fee unpaid while the request awaits payment", () => {
    const row = mapAssignment({ ...serverAssignment, request: { status: "AWAITING_PAYMENT" } });
    expect(row.fee_paid).toBe(0);
  });
});

describe("mergeAssignment", () => {
  const local: Assignment = { ...mapAssignment(serverAssignment), status: "QUOTED", quote_data: '{"prices":[]}' };

  it("keeps the optimistic local status while a push is still queued", () => {
    const merged = mergeAssignment(mapAssignment(serverAssignment), local, true);
    expect(merged.status).toBe("QUOTED");
    expect(merged.quote_data).toBe('{"prices":[]}');
  });

  it("takes the server row once the server has moved on", () => {
    const server = mapAssignment({ ...serverAssignment, status: "QUOTED", quote: { status: "SELECTED" } });
    const merged = mergeAssignment(server, local, true);
    expect(merged.quote_data).toBe('{"status":"SELECTED"}');
  });

  it("takes the server row when nothing is queued", () => {
    expect(mergeAssignment(mapAssignment(serverAssignment), local, false).status).toBe("PENDING");
  });
});

describe("listing mappers", () => {
  it("coerces nullable brand/model to empty strings for NOT NULL columns", () => {
    const row = mapTyre({ id: "t1", width: 205, height: 55, diameter: 16, brand: null, model: null, condition: "NEW", priceGhs: 850, photos: ["https://x/1.jpg"], inStock: true, updatedAt: "2026-10-01T00:00:00Z" });
    expect(row).toMatchObject({ id: "t1", server_id: "t1", brand: "", model: "", in_stock: 1, photos: '["https://x/1.jpg"]', proposed: 0 });
  });

  it("maps the catalog link and price advice on tyres", () => {
    const base = { id: "t1", width: 205, height: 55, diameter: 16, brand: "Michelin", model: "Primacy 4", condition: "NEW", priceGhs: 850, photos: [], inStock: true, updatedAt: "2026-10-01T00:00:00Z" };
    const linked = mapTyre({ ...base, tyreSizeId: "s1", priceAdvice: { lowestGhs: 300, maxGhs: 330 } });
    expect(linked.tyre_size_id).toBe("s1");
    expect(JSON.parse(linked.price_advice as string)).toEqual({ lowestGhs: 300, maxGhs: 330 });
    const unlinked = mapTyre(base);
    expect(unlinked.tyre_size_id).toBeNull();
    expect(unlinked.price_advice).toBeNull();
    expect(linked.proposed).toBe(0);
    expect(unlinked.proposed).toBe(0);
  });

  it("marks a tyre waiting for an admin (proposed, not linked yet)", () => {
    const base = { id: "t1", width: 205, height: 55, diameter: 16, brand: "Westlake", model: "RP18", condition: "NEW", priceGhs: 850, photos: [], inStock: true, updatedAt: "2026-10-01T00:00:00Z" };
    expect(mapTyre({ ...base, proposedAt: "2026-10-08T00:00:00Z", tyreSizeId: null }).proposed).toBe(1);
    // Linked by an admin: no longer waiting, though proposedAt stays as history.
    expect(mapTyre({ ...base, proposedAt: "2026-10-08T00:00:00Z", tyreSizeId: "s1" }).proposed).toBe(0);
  });

  it("maps lights and keeps the server id as the local key", () => {
    const row = mapLight({ id: "l1", lightType: "Headlight Assembly", side: "Left", make: "Toyota", model: null, year: null, condition: "USED", priceGhs: 300, photos: [], inStock: false, updatedAt: "2026-10-01T00:00:00Z" });
    expect(row).toMatchObject({ id: "l1", server_id: "l1", model: "", year: "", in_stock: 0 });
  });

  it("maps orders with a stable updated_at supplied by the caller", () => {
    const row = mapOrder({ id: "o1", fulfillmentStage: "TO_BRING", handedOverAt: null, handoverPhotos: [], request: { partName: "X" }, wonItems: [], totalEarnGhs: 120 }, "now");
    expect(row).toMatchObject({ id: "o1", stage: "TO_BRING", total_earn_ghs: 120, updated_at: "now", handover_photos: "[]", payout_status: "UNPAID", payout_method: null });
  });

  it("maps payout fields when the API sends them", () => {
    const row = mapOrder({ id: "o1", fulfillmentStage: "HANDED_OVER", handedOverAt: "t", handoverPhotos: [], request: {}, wonItems: [], totalEarnGhs: 120,
      payout: { status: "PAID", method: "MOMO", amountGhs: 120, paidAt: "2026-10-06T10:00:00Z", reference: "MP123" } }, "now");
    expect(row).toMatchObject({ payout_status: "PAID", payout_method: "MOMO", payout_amount_ghs: 120, payout_ref: "MP123" });
  });
});

describe("payout helpers", () => {
  it("sums earned, paid and owed (owed only once collected)", () => {
    expect(earningsSummary([
      { total_earn_ghs: 100, payout_status: "PAID", payout_amount_ghs: 90, stage: "HANDED_OVER" },
      { total_earn_ghs: 50, payout_status: "UNPAID", payout_amount_ghs: null, stage: "HANDED_OVER" },
      { total_earn_ghs: 70, payout_status: "UNPAID", payout_amount_ghs: null, stage: "TO_BRING" },
    ])).toEqual({ earnedGhs: 220, paidGhs: 90, owedGhs: 50 });
  });

  it("labels payout state for the vendor", () => {
    expect(payoutLabel({ payout_status: "UNPAID", payout_method: null, payout_at: null, stage: "TO_BRING" })).toEqual({ text: "Paid after collection", tone: "muted" });
    expect(payoutLabel({ payout_status: "UNPAID", payout_method: null, payout_at: null, stage: "HANDED_OVER" })).toEqual({ text: "Payout pending", tone: "owed" });
    expect(payoutLabel({ payout_status: "PAID", payout_method: "CASH", payout_at: null, stage: "HANDED_OVER" })).toEqual({ text: "Paid by cash", tone: "paid" });
  });
});

describe("mapFluid", () => {
  it("maps a fluid listing from the server", () => {
    const row = mapFluid({
      id: "f1", fluidProductId: "p1", priceGhs: 300, photos: ["https://p/1.jpg"], inStock: true, updatedAt: "2026-10-08T00:00:00Z",
      reviewStatus: "PRICE_CHECK", priceAdvice: { lowestGhs: 250, maxGhs: 275 },
      product: { kindId: "k", kind: "Engine oil", brandId: "b", brand: "Total", name: "Quartz 9000", grade: "5W-40", coolantColour: null, coolantMix: null, sizeLabel: "4 L", title: "Total Quartz 9000 · 5W-40 · 4 L", status: "APPROVED" },
    });
    expect(row).toEqual({
      id: "f1", server_id: "f1", fluid_product_id: "p1", kind_id: "k", kind: "Engine oil", brand_id: "b", brand: "Total", product: "Quartz 9000",
      grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L", status: "APPROVED", review_status: "PRICE_CHECK",
      price_ghs: 300, photos: '["https://p/1.jpg"]', in_stock: 1, price_advice: '{"lowestGhs":250,"maxGhs":275}', updated_at: "2026-10-08T00:00:00Z",
    });
  });
});
