// The sync pass refreshes both catalogs inside its parallel pull phase and writes them afterwards, one
// at a time. A failing or unchanged catalog never blocks the others or touches the cached copy.
const anyFn = (fallback: unknown) => new Proxy({} as Record<string, jest.Mock>, {
  get: (t, k: string) => (t[k] ??= jest.fn(async () => fallback)),
});
jest.mock("../lib/db", () => {
  const stub = anyFn([]);
  return new Proxy({ cacheCatalog: jest.fn(), getCachedCatalog: jest.fn(async () => null), getCatalogEtag: jest.fn(async () => null) } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : stub[k]),
  });
});
jest.mock("../lib/api", () => {
  const stub = anyFn({ assignments: [], orders: [], listings: [], brands: [] });
  return new Proxy({
    api: { get: jest.fn(async () => ({ orders: [], assignments: [] })), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    partsCatalogApi: { get: jest.fn() },
    carListApi: { get: jest.fn() },
  } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : { getAll: stub.getAll, get: stub.get }) });
});
jest.mock("../lib/auth", () => ({ getToken: jest.fn(async () => "tok") }));
jest.mock("../lib/upload", () => ({ uploadLocalPhotos: jest.fn() }));
jest.mock("../lib/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

import * as db from "../lib/db";
import { carListApi, partsCatalogApi } from "../lib/api";
import { sync } from "../lib/sync";

const mocked = (f: unknown) => f as jest.Mock;
const parts = { list: "LIVE", version: "p1", groups: [], parts: [] };
const cars = { list: "LIVE", version: "c1", makes: [] };

beforeEach(() => {
  mocked(db.cacheCatalog).mockReset();
  mocked(db.getCatalogEtag).mockReset().mockResolvedValue(null);
  mocked(partsCatalogApi.get).mockReset().mockResolvedValue({ status: 200, body: parts, etag: '"p1"' });
  mocked(carListApi.get).mockReset().mockResolvedValue({ status: 200, body: cars, etag: '"c1"' });
});

describe("sync and the shared catalogs", () => {
  it("stores both catalogs with their ETags", async () => {
    const result = await sync();
    expect(result.ok).toBe(true);
    expect(db.cacheCatalog).toHaveBeenCalledWith("parts_catalog_cache", parts, '"p1"');
    expect(db.cacheCatalog).toHaveBeenCalledWith("car_list_cache", cars, '"c1"');
  });

  it("writes nothing on 304 and keeps the last good copy when a fetch fails, and the other catalog still lands", async () => {
    mocked(db.getCatalogEtag).mockImplementation(async (t: string) => (t === "parts_catalog_cache" ? '"p1"' : '"c1"'));
    mocked(partsCatalogApi.get).mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    mocked(carListApi.get).mockResolvedValue({ status: 304 });
    const result = await sync();
    expect(partsCatalogApi.get).toHaveBeenCalledWith('"p1"');
    expect(carListApi.get).toHaveBeenCalledWith('"c1"');
    expect(db.cacheCatalog).not.toHaveBeenCalled();
    expect(result.ok).toBe(true); // the inbox is what fails a pass, not a catalog
    expect((result.error as Error).message).toBe("offline");

    mocked(carListApi.get).mockResolvedValue({ status: 200, body: cars, etag: '"c2"' });
    await sync();
    expect(db.cacheCatalog).toHaveBeenCalledTimes(1);
    expect(db.cacheCatalog).toHaveBeenCalledWith("car_list_cache", cars, '"c2"');
  });

  it("writes one catalog at a time", async () => {
    let writing = 0;
    let overlapped = false;
    mocked(db.cacheCatalog).mockImplementation(async () => {
      if (++writing > 1) overlapped = true;
      await new Promise((r) => setTimeout(r, 5));
      writing--;
    });
    await sync();
    expect(db.cacheCatalog).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
  });
});
