// The fluid listing queue against a mocked server and database: the two vendor-visible
// failure paths (already listed, not approved) must settle the op instead of looping or wedging.
jest.mock("../lib/db", () => ({
  deleteListing: jest.fn(),
  markFluidRejected: jest.fn(),
  enqueueListingOp: jest.fn(),
  getPendingListingOps: jest.fn(),
  markListingOpError: jest.fn(),
  markListingOpSynced: jest.fn(),
  upsertFluidListing: jest.fn(),
}));
jest.mock("../lib/api", () => ({
  api: {},
  lightListingsApi: {},
  tyreListingsApi: {},
  tyreCatalogApi: {},
  fluidCatalogApi: {},
  fluidListingsApi: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock("../lib/auth", () => ({ getToken: jest.fn() }));
jest.mock("../lib/upload", () => ({ uploadLocalPhotos: jest.fn(async (uris: string[]) => uris.map((u) => u.replace("file://", "https://cdn/"))) }));

import { ApiError } from "../lib/api-error";
import * as db from "../lib/db";
import { fluidListingsApi } from "../lib/api";
import { pushPendingFluidListings } from "../lib/sync";

const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const create = mocked(fluidListingsApi.create);
const pending = mocked(db.getPendingListingOps);
const update = mocked(fluidListingsApi.update);

const createOp = {
  id: "create-local-1", op: "create", listing_id: "local-1", synced: 0, error: null, created_at: "t",
  payload: JSON.stringify({ server_id: null, kindId: "k", brandId: "b", productName: "Quartz 9000", sizeLabel: "4 L", priceGhs: 300, photos: ["file://a.jpg"], inStock: true, genuine: true }),
};
const laterUpdate = { id: "update-local-1", op: "update", listing_id: "local-1", synced: 0, error: null, created_at: "t2", payload: JSON.stringify({ server_id: null, priceGhs: 280 }) };

/** The queue as the DB would report it: unsynced items only, shrinking as ops are marked synced. */
function queueOf(...initial: unknown[]) {
  type Item = { id: string; created_at: string };
  const all = [...(initial as Item[])];
  const done = new Set<string>();
  mocked(db.markListingOpSynced).mockImplementation(async (_k: string, id: string) => { done.add(id); });
  // Ops enqueued during a flush join the queue, as they would in SQLite (oldest first).
  mocked(db.enqueueListingOp).mockImplementation(async (_k: string, q: Item) => { all.push(q); });
  pending.mockImplementation(async () => all.filter((i) => !done.has(i.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

beforeEach(() => jest.clearAllMocks());

describe("pushPendingFluidListings", () => {
  it("uploads offline photos, then re-keys the local row to the server id on success", async () => {
    queueOf(createOp);
    create.mockResolvedValue({
      pending: false,
      listing: {
        id: "srv-1", fluidProductId: "p1", priceGhs: 300, photos: ["https://cdn/a.jpg"], inStock: true, updatedAt: "t", reviewStatus: "OK", hidden: false, hiddenReason: null,
        product: { kindId: "k", kind: "Engine oil", brandId: "b", brand: "Total", name: "Quartz 9000", grade: "5W-40", coolantColour: null, coolantMix: null, sizeLabel: "4 L", title: "t", status: "APPROVED" },
      },
    });
    await pushPendingFluidListings();
    expect(db.upsertFluidListing).toHaveBeenCalledWith(expect.objectContaining({ id: "srv-1", server_id: "srv-1" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ photos: ["https://cdn/a.jpg"] }));
    expect(db.deleteListing).toHaveBeenCalledWith("fluid", "local-1");
    expect(db.markListingOpSynced).toHaveBeenCalledWith("fluid", "create-local-1");
  });

  it("sends a stock toggle as inStock alone: no photo upload, no price", async () => {
    queueOf({ id: "update-srv-1", op: "update", listing_id: "srv-1", synced: 0, error: null, created_at: "t", payload: JSON.stringify({ server_id: "srv-1", inStock: false }) });
    update.mockResolvedValue({});
    await pushPendingFluidListings();
    expect(update).toHaveBeenCalledWith("srv-1", { inStock: false });
  });

  it("links to the existing listing on 409 ALREADY_LISTED instead of looping", async () => {
    queueOf(createOp, laterUpdate);
    create.mockRejectedValue(new ApiError("You already list this.", 409, { code: "ALREADY_LISTED", listingId: "srv-9" }));
    await pushPendingFluidListings();
    expect(create).toHaveBeenCalledTimes(1);
    expect(db.deleteListing).toHaveBeenCalledWith("fluid", "local-1");
    // The edit queued behind the create now targets the real listing.
    expect(db.enqueueListingOp).toHaveBeenCalledWith("fluid", expect.objectContaining({ listing_id: "srv-9", payload: expect.stringContaining('"server_id":"srv-9"') }));
    // The vendor's new price, photos and stock land on the existing listing; the product is untouched.
    const patch = (db.enqueueListingOp as jest.Mock).mock.calls.map((c) => c[1]).find((q) => q.id === "create-local-1-existing");
    expect(patch).toMatchObject({ op: "update", listing_id: "srv-9", synced: 0 });
    expect(JSON.parse(patch.payload)).toEqual({ server_id: "srv-9", priceGhs: 300, photos: ["https://cdn/a.jpg"], inStock: true });
    expect(db.markListingOpSynced).toHaveBeenCalledWith("fluid", "create-local-1");
    expect(db.markListingOpError).not.toHaveBeenCalled();
    // Same pass: the vendor's input goes first, then the edit that was waiting behind the create.
    expect(create).toHaveBeenCalledTimes(1);
    expect(update.mock.calls).toEqual([
      ["srv-9", { priceGhs: 300, photos: ["https://cdn/a.jpg"], inStock: true }],
      ["srv-9", { priceGhs: 280 }],
    ]);
    expect(db.markFluidRejected).not.toHaveBeenCalled();
  });

  it("marks the op failed with the reason on 403 NOT_APPROVED and keeps flushing", async () => {
    queueOf(createOp);
    const msg = `"Oils & fluids" isn't on your approved list yet. Ask for approval first.`;
    create.mockRejectedValue(new ApiError(msg, 403, { code: "NOT_APPROVED", item: "Oils & fluids" }));
    await expect(pushPendingFluidListings()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(db.markListingOpSynced).toHaveBeenCalledWith("fluid", "create-local-1", msg);
    // The row is kept and marked with the reason, not orphaned as "waiting for approval".
    expect(db.markFluidRejected).toHaveBeenCalledWith("local-1", msg);
    expect(db.deleteListing).not.toHaveBeenCalled();
  });

  it("marks the row rejected for a plain 400 and a 409 that is not ALREADY_LISTED", async () => {
    queueOf(createOp);
    create.mockRejectedValue(new ApiError("Choose a grade from the list.", 400));
    await pushPendingFluidListings();
    expect(db.markFluidRejected).toHaveBeenLastCalledWith("local-1", "Choose a grade from the list.");
    create.mockRejectedValue(new ApiError("Conflict", 409, { code: "OTHER" }));
    queueOf(createOp);
    await pushPendingFluidListings();
    expect(db.markFluidRejected).toHaveBeenLastCalledWith("local-1", "Conflict");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not mark the row rejected when offline", async () => {
    queueOf(createOp);
    create.mockRejectedValue(new ApiError("Network request failed", 0));
    await expect(pushPendingFluidListings()).rejects.toBeDefined();
    expect(db.markFluidRejected).not.toHaveBeenCalled();
  });

  it("leaves the op queued and stops when offline", async () => {
    queueOf(createOp);
    create.mockRejectedValue(new ApiError("Network request failed", 0));
    await expect(pushPendingFluidListings()).rejects.toMatchObject({ status: 0 });
    expect(db.markListingOpError).toHaveBeenCalledWith("fluid", "create-local-1", "Network request failed");
    expect(db.markListingOpSynced).not.toHaveBeenCalled();
  });
});
