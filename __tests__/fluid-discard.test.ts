const mockDelete = jest.fn();
const mockEnqueue = jest.fn();
const mockApi = jest.fn();
jest.mock("../lib/db", () => ({
  deleteListing: (...a: unknown[]) => mockDelete(...a),
  enqueueListingOp: (...a: unknown[]) => mockEnqueue(...a),
  upsertFluidListing: jest.fn(),
}));
jest.mock("../lib/api", () => ({ api: { get: (...a: unknown[]) => mockApi(...a), post: (...a: unknown[]) => mockApi(...a), patch: (...a: unknown[]) => mockApi(...a), delete: (...a: unknown[]) => mockApi(...a) } }));

import { discardRejectedFluid } from "../lib/listings";

describe("discardRejectedFluid", () => {
  it("removes a rejected local row without queueing anything or calling the server", async () => {
    await discardRejectedFluid("local-1");
    expect(mockDelete).toHaveBeenCalledWith("fluid", "local-1");
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
  });
});
