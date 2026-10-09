const mockUpsert = jest.fn();
const mockEnqueue = jest.fn();
jest.mock("../lib/db", () => ({
  deleteListing: jest.fn(),
  enqueueListingOp: (...a: unknown[]) => mockEnqueue(...a),
  upsertBatteryListing: (...a: unknown[]) => mockUpsert(...a),
}));
jest.mock("../lib/api", () => ({ api: {} }));

import { saveBatteryListing, setBatteryStock } from "../lib/listings";
import type { BatteryListing } from "../lib/db";

const base: BatteryListing = {
  id: "local-1", server_id: null, battery_product_id: null, brand_id: "b", brand: "Varta", size_id: "s60", size_code: "NS60", terminal: "LEFT",
  battery_type: "MF", voltage: 12, capacity_ah: 45, cca: 330, warranty_months: 12, status: "LOCAL", review_status: "OK", hidden: 0, hidden_reason: null,
  rejected_reason: null, price_ghs: 900, photos: "[]", in_stock: 1, price_advice: null, updated_at: "x",
};

describe("saveBatteryListing", () => {
  beforeEach(() => jest.clearAllMocks());
  it("refuses a REJECTED row: nothing is written or queued", async () => {
    await expect(saveBatteryListing({ ...base, status: "REJECTED", rejected_reason: "no" }, false)).rejects.toThrow(/not saved/i);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
  it("queues a create with the pick, the label figures, the warranty and the genuine tick", async () => {
    await saveBatteryListing(base, true);
    const op = mockEnqueue.mock.calls[0][1];
    expect(mockEnqueue.mock.calls[0][0]).toBe("battery");
    expect(JSON.parse(op.payload)).toEqual({
      server_id: null, brandId: "b", sizeId: "s60", terminal: "LEFT", voltage: 12, capacityAh: 45, cca: 330, type: "MF",
      priceGhs: 900, photos: [], inStock: true, warrantyMonths: 12, genuine: true,
    });
  });
  it("a typed brand is sent as its name", async () => {
    await saveBatteryListing({ ...base, brand_id: null, brand: "Fengli" }, true);
    const body = JSON.parse(mockEnqueue.mock.calls[0][1].payload);
    expect(body.brandName).toBe("Fengli");
    expect(body).not.toHaveProperty("brandId");
  });
  it("an edit sends only price, photos, stock and warranty", async () => {
    await saveBatteryListing({ ...base, status: "APPROVED", server_id: "srv-1" }, false);
    expect(Object.keys(JSON.parse(mockEnqueue.mock.calls[0][1].payload)).sort()).toEqual(["inStock", "photos", "priceGhs", "server_id", "warrantyMonths"]);
  });
  it("queues a stock toggle as exactly { server_id, inStock }", async () => {
    const next = await setBatteryStock({ ...base, status: "APPROVED", server_id: "srv-1" }, false);
    expect(next.in_stock).toBe(0);
    expect(JSON.parse(mockEnqueue.mock.calls[0][1].payload)).toEqual({ server_id: "srv-1", inStock: false });
  });
});
