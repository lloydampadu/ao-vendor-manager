// The battery listing queue against a mocked server and database: a create re-keys to the server id,
// "already listed" adopts the existing listing (keeping the typed price, stock and warranty), and a
// refused create is marked REJECTED instead of retrying for ever.
jest.mock("../lib/db", () => ({
  deleteListing: jest.fn(),
  markFluidRejected: jest.fn(),
  markListingRejected: jest.fn(),
  enqueueListingOp: jest.fn(),
  getPendingListingOps: jest.fn(),
  markListingOpError: jest.fn(),
  markListingOpSynced: jest.fn(),
  upsertFluidListing: jest.fn(),
  upsertBatteryListing: jest.fn(),
}));
jest.mock("../lib/api", () => ({
  api: {}, lightListingsApi: {}, tyreListingsApi: {}, tyreCatalogApi: {}, fluidCatalogApi: {}, fluidListingsApi: {}, batteryCatalogApi: {},
  batteryListingsApi: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock("../lib/auth", () => ({ getToken: jest.fn() }));
jest.mock("../lib/upload", () => ({ uploadLocalPhotos: jest.fn(async (uris: string[]) => uris.map((u) => u.replace("file://", "https://cdn/"))) }));

import { ApiError } from "../lib/api-error";
import * as db from "../lib/db";
import { batteryListingsApi } from "../lib/api";
import { pushPendingBatteryListings } from "../lib/sync";

const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const create = mocked(batteryListingsApi.create);
const pending = mocked(db.getPendingListingOps);

const createOp = {
  id: "create-local-1", op: "create", listing_id: "local-1", synced: 0, error: null, created_at: "t",
  payload: JSON.stringify({ server_id: null, brandId: "b", sizeId: "s60", terminal: "LEFT", voltage: 12, capacityAh: 45, cca: 330, type: "MF", priceGhs: 900, photos: ["file://a.jpg"], inStock: true, warrantyMonths: 12, genuine: true }),
};

function queueOf(...initial: unknown[]) {
  type Item = { id: string; created_at: string };
  const all = [...(initial as Item[])];
  const done = new Set<string>();
  mocked(db.markListingOpSynced).mockImplementation(async (_k: string, id: string) => { done.add(id); });
  mocked(db.enqueueListingOp).mockImplementation(async (_k: string, q: Item) => { all.push(q); });
  pending.mockImplementation(async () => all.filter((i) => !done.has(i.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

beforeEach(() => jest.clearAllMocks());

describe("pushPendingBatteryListings", () => {
  it("uploads offline photos, then re-keys the local row to the server id", async () => {
    queueOf(createOp);
    create.mockResolvedValue({
      pending: false,
      listing: {
        id: "srv-1", batteryProductId: "p1", priceGhs: 900, photos: ["https://cdn/a.jpg"], inStock: true, warrantyMonths: 12, updatedAt: "t", reviewStatus: "OK", hidden: false, hiddenReason: null,
        product: { brandId: "b", brand: "Varta", sizeId: "s60", sizeCode: "NS60", terminal: "LEFT", voltage: 12, capacityAh: 45, cca: 330, type: "MF", title: "t", status: "APPROVED" },
      },
    });
    await pushPendingBatteryListings();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ photos: ["https://cdn/a.jpg"], warrantyMonths: 12 }));
    expect(db.upsertBatteryListing).toHaveBeenCalledWith(expect.objectContaining({ id: "srv-1", server_id: "srv-1", warranty_months: 12 }));
    expect(db.deleteListing).toHaveBeenCalledWith("battery", "local-1");
  });

  it("already listed: adopts the existing listing and carries the typed price, stock and warranty onto it", async () => {
    queueOf(createOp);
    create.mockRejectedValue(new ApiError("You already list this.", 409, { code: "ALREADY_LISTED", listingId: "srv-9" }));
    await pushPendingBatteryListings();
    const adopted = mocked(db.enqueueListingOp).mock.calls.map((c) => c[1]).find((q: { op: string }) => q.op === "update");
    expect(JSON.parse(adopted.payload)).toEqual({ server_id: "srv-9", priceGhs: 900, photos: ["https://cdn/a.jpg"], inStock: true, warrantyMonths: 12 });
    expect(db.deleteListing).toHaveBeenCalledWith("battery", "local-1");
  });

  it("a create the server refuses for good is marked REJECTED with the reason", async () => {
    queueOf(createOp);
    create.mockRejectedValue(new ApiError("This battery isn't in our list yet. Enter the capacity in Ah, from 20 to 250.", 400));
    await pushPendingBatteryListings();
    expect(db.markListingRejected).toHaveBeenCalledWith("battery", "local-1", "This battery isn't in our list yet. Enter the capacity in Ah, from 20 to 250.");
    expect(db.markListingOpSynced).toHaveBeenCalledWith("battery", "create-local-1", expect.any(String));
  });
});
