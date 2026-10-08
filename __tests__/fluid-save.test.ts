const mockUpsert = jest.fn();
const mockEnqueue = jest.fn();
jest.mock("../lib/db", () => ({
  deleteListing: jest.fn(),
  enqueueListingOp: (...a: unknown[]) => mockEnqueue(...a),
  upsertFluidListing: (...a: unknown[]) => mockUpsert(...a),
}));
jest.mock("../lib/api", () => ({ api: {} }));

import { saveFluidListing } from "../lib/listings";
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
});
