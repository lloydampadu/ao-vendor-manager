// Applying a pulled listing snapshot, the same for every listing kind: rows with a local edit in
// flight are left alone, the rest are written and de-duplicated, and rows the server no longer
// returns are pruned (never a pending one).
jest.mock("../lib/db", () => ({
  getListingIdsWithPendingOps: jest.fn(),
  upsertTyreListing: jest.fn(),
  upsertLightListing: jest.fn(),
  upsertFluidListing: jest.fn(),
  upsertBatteryListing: jest.fn(),
  deleteDuplicateListings: jest.fn(),
  pruneListings: jest.fn(),
}));
jest.mock("../lib/mappers", () => ({
  ...jest.requireActual("../lib/mappers"),
  mapTyre: (l: { id: string }) => ({ mapped: "tyre", id: l.id }),
  mapLight: (l: { id: string }) => ({ mapped: "light", id: l.id }),
  mapFluid: (l: { id: string }) => ({ mapped: "fluid", id: l.id }),
  mapBattery: (l: { id: string }) => ({ mapped: "battery", id: l.id }),
}));
jest.mock("../lib/api", () => ({
  api: {}, lightListingsApi: {}, tyreListingsApi: {}, tyreCatalogApi: {}, fluidCatalogApi: {}, fluidListingsApi: {}, batteryCatalogApi: {}, batteryListingsApi: {},
}));
jest.mock("../lib/auth", () => ({ getToken: jest.fn() }));
jest.mock("../lib/upload", () => ({ uploadLocalPhotos: jest.fn() }));

import * as db from "../lib/db";
import { applyBatteryListings, applyFluidListings, applyLightListings, applyTyreListings } from "../lib/sync";

const mocked = (f: unknown) => f as jest.Mock;

const cases = [
  ["tyre", applyTyreListings, db.upsertTyreListing],
  ["light", applyLightListings, db.upsertLightListing],
  ["fluid", applyFluidListings, db.upsertFluidListing],
  ["battery", applyBatteryListings, db.upsertBatteryListing],
] as const;

beforeEach(() => jest.clearAllMocks());

describe.each(cases)("applying the %s listings the server returned", (kind, apply, upsert) => {
  it("skips rows with a pending edit, writes and de-duplicates the rest, then prunes keeping the pending ones", async () => {
    const pending = new Set(["p1"]);
    mocked(db.getListingIdsWithPendingOps).mockResolvedValue(pending);
    await apply({ listings: [{ id: "a" }, { id: "p1" }, { id: "b" }] } as never);
    expect(db.getListingIdsWithPendingOps).toHaveBeenCalledWith(kind);
    expect(mocked(upsert).mock.calls).toEqual([[{ mapped: kind, id: "a" }], [{ mapped: kind, id: "b" }]]);
    expect(mocked(db.deleteDuplicateListings).mock.calls).toEqual([[kind, "a", "a"], [kind, "b", "b"]]);
    expect(db.pruneListings).toHaveBeenCalledWith(kind, new Set(["a", "p1", "b"]), pending);
    // Prune runs last, after every row is written.
    const lastUpsert = Math.max(...mocked(upsert).mock.invocationCallOrder);
    expect(mocked(db.pruneListings).mock.invocationCallOrder[0]).toBeGreaterThan(lastUpsert);
  });
});
