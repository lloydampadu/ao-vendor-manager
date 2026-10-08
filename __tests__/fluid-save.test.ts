const mockUpsert = jest.fn();
const mockEnqueue = jest.fn();
jest.mock("../lib/db", () => ({
  deleteListing: jest.fn(),
  enqueueListingOp: (...a: unknown[]) => mockEnqueue(...a),
  upsertFluidListing: (...a: unknown[]) => mockUpsert(...a),
}));
jest.mock("../lib/api", () => ({ api: {} }));

import { saveFluidListing, setFluidStock } from "../lib/listings";
import type { FluidListing } from "../lib/db";

const base: FluidListing = {
  id: "local-1", server_id: null, fluid_product_id: null, kind_id: "k", kind: "Engine oil", brand_id: "b", brand: "Total", product: "Quartz 9000",
  grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L", status: "REJECTED", review_status: "OK", hidden: 0, hidden_reason: null,
  rejected_reason: "Choose a grade from the list.", price_ghs: 300, photos: "[]", in_stock: 1, price_advice: null, updated_at: "x",
};

describe("saveFluidListing", () => {
  beforeEach(() => jest.clearAllMocks());
  it("refuses a REJECTED row: nothing is written or queued", async () => {
    await expect(saveFluidListing(base, false)).rejects.toThrow(/not saved/i);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
  it("saves any other row and queues it", async () => {
    await saveFluidListing({ ...base, status: "LOCAL", rejected_reason: null }, true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith("fluid", expect.objectContaining({ op: "create" }));
  });
  it("queues a stock toggle as exactly { server_id, inStock }", async () => {
    const row = { ...base, status: "APPROVED" as const, server_id: "srv-1", rejected_reason: null };
    const next = await setFluidStock(row, false);
    expect(next.in_stock).toBe(0);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ in_stock: 0 }));
    const op = mockEnqueue.mock.calls[0][1];
    expect(op.op).toBe("update");
    expect(JSON.parse(op.payload)).toEqual({ server_id: "srv-1", inStock: false });
  });
  it("sends only price, photos and stock when a listing is edited", async () => {
    await saveFluidListing({ ...base, status: "APPROVED", server_id: "srv-1", rejected_reason: null }, false);
    expect(Object.keys(JSON.parse(mockEnqueue.mock.calls[0][1].payload)).sort()).toEqual(["inStock", "photos", "priceGhs", "server_id"]);
  });
});
