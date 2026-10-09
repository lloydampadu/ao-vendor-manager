// The parts list and the car list are cached offline with their ETag: a first sync stores them, a
// later sync sends the ETag and stores nothing on 304, and a failed fetch keeps the last good copy.
// Asking for the ETag never parses the cached document, and a parsed document is kept in memory until a write.
jest.mock("../lib/db", () => ({ cacheCatalog: jest.fn(), getCachedCatalog: jest.fn(), getCatalogEtag: jest.fn() }));
jest.mock("../lib/api", () => ({ partsCatalogApi: { get: jest.fn() }, carListApi: { get: jest.fn() } }));

import * as db from "../lib/db";
import { carListApi, partsCatalogApi } from "../lib/api";
import { fetchCarList, fetchPartsCatalog, loadCarList, loadPartsCatalog, storeCarList, storePartsCatalog } from "../lib/parts-list";

const mocked = (f: unknown) => f as jest.Mock;
const parts = { list: "LIVE" as const, version: "p1", groups: [], parts: [] };
const parts2 = { list: "LIVE" as const, version: "p2", groups: [], parts: [] };
const cars = { list: "LIVE" as const, version: "c1", makes: [] };

// The module keeps parsed catalogs in memory; a write clears them, so each test starts from a write.
beforeEach(async () => {
  jest.resetAllMocks();
  await storePartsCatalog({ status: 200, body: parts, etag: null });
  await storeCarList({ status: 200, body: cars, etag: null });
  jest.resetAllMocks();
});

describe("the parts list cache", () => {
  it("fetches without an ETag on the first sync, then stores the body with its ETag", async () => {
    mocked(db.getCatalogEtag).mockResolvedValue(null);
    mocked(partsCatalogApi.get).mockResolvedValue({ status: 200, body: parts, etag: '"p1"' });
    const res = await fetchPartsCatalog();
    expect(partsCatalogApi.get).toHaveBeenCalledWith(null);
    expect(db.cacheCatalog).not.toHaveBeenCalled(); // fetching is network only; the sync writes afterwards
    await storePartsCatalog(res);
    expect(db.cacheCatalog).toHaveBeenCalledWith("parts_catalog_cache", parts, '"p1"');
  });

  it("sends the stored ETag without reading the cached document, and writes nothing on 304", async () => {
    mocked(db.getCatalogEtag).mockResolvedValue('"p1"');
    mocked(partsCatalogApi.get).mockResolvedValue({ status: 304 });
    await storePartsCatalog(await fetchPartsCatalog());
    expect(db.getCatalogEtag).toHaveBeenCalledWith("parts_catalog_cache");
    expect(db.getCachedCatalog).not.toHaveBeenCalled();
    expect(partsCatalogApi.get).toHaveBeenCalledWith('"p1"');
    expect(db.cacheCatalog).not.toHaveBeenCalled();
  });

  it("keeps the last good copy when the fetch fails", async () => {
    mocked(db.getCatalogEtag).mockResolvedValue('"p1"');
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    mocked(partsCatalogApi.get).mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    await expect(fetchPartsCatalog()).rejects.toThrow("offline");
    expect(db.cacheCatalog).not.toHaveBeenCalled();
    expect(await loadPartsCatalog()).toEqual(parts);
  });

  it("reads the cached list offline, and null before the first sync", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    expect(await loadPartsCatalog()).toEqual(parts);
    await storePartsCatalog({ status: 200, body: parts, etag: '"p1"' }); // clears the memory copy
    mocked(db.getCachedCatalog).mockResolvedValue(null);
    expect(await loadPartsCatalog()).toBeNull();
  });

  it("parses the stored list once, and reads it again only after a write", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    expect(await loadPartsCatalog()).toBe(await loadPartsCatalog());
    expect(db.getCachedCatalog).toHaveBeenCalledTimes(1);

    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts2, etag: '"p2"' });
    await storePartsCatalog({ status: 304 }); // nothing written, the copy in memory stays
    expect(await loadPartsCatalog()).toEqual(parts);
    await storePartsCatalog({ status: 200, body: parts2, etag: '"p2"' });
    expect(await loadPartsCatalog()).toEqual(parts2);
    expect(db.getCachedCatalog).toHaveBeenCalledTimes(2);
  });
});

describe("the car list cache", () => {
  it("sends its own stored ETag, stores the body on 200, nothing on 304", async () => {
    mocked(db.getCatalogEtag).mockImplementation(async (t: string) => (t === "car_list_cache" ? '"c0"' : '"p0"'));
    mocked(carListApi.get).mockResolvedValueOnce({ status: 200, body: cars, etag: '"c1"' });
    await storeCarList(await fetchCarList());
    expect(db.getCatalogEtag).toHaveBeenCalledWith("car_list_cache");
    expect(carListApi.get).toHaveBeenCalledWith('"c0"');
    expect(db.cacheCatalog).toHaveBeenCalledWith("car_list_cache", cars, '"c1"');

    mocked(db.cacheCatalog).mockClear();
    mocked(carListApi.get).mockResolvedValueOnce({ status: 304 });
    await storeCarList(await fetchCarList());
    expect(db.cacheCatalog).not.toHaveBeenCalled();
  });

  it("reads the cached car list offline, parsed once", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: cars, etag: '"c1"' });
    expect(await loadCarList()).toEqual(cars);
    expect(await loadCarList()).toEqual(cars);
    expect(db.getCachedCatalog).toHaveBeenCalledTimes(1);
    expect(db.getCachedCatalog).toHaveBeenCalledWith("car_list_cache");
  });
});
