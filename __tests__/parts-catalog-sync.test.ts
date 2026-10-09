// The parts list and the car list are cached offline with their ETag: a first sync stores them, a
// later sync sends the ETag and stores nothing on 304, and a failed fetch keeps the last good copy.
jest.mock("../lib/db", () => ({ cacheCatalog: jest.fn(), getCachedCatalog: jest.fn() }));
jest.mock("../lib/api", () => ({ partsCatalogApi: { get: jest.fn() }, carListApi: { get: jest.fn() } }));

import * as db from "../lib/db";
import { carListApi, partsCatalogApi } from "../lib/api";
import { fetchCarList, fetchPartsCatalog, loadCarList, loadPartsCatalog, storeCarList, storePartsCatalog } from "../lib/parts-list";

const mocked = (f: unknown) => f as jest.Mock;
const parts = { list: "LIVE", version: "p1", groups: [], parts: [] };
const cars = { list: "LIVE", version: "c1", makes: [] };

beforeEach(() => jest.resetAllMocks());

describe("the parts list cache", () => {
  it("fetches without an ETag on the first sync, then stores the body with its ETag", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue(null);
    mocked(partsCatalogApi.get).mockResolvedValue({ status: 200, body: parts, etag: '"p1"' });
    const res = await fetchPartsCatalog();
    expect(partsCatalogApi.get).toHaveBeenCalledWith(null);
    expect(db.cacheCatalog).not.toHaveBeenCalled(); // fetching is network only; the sync writes afterwards
    await storePartsCatalog(res);
    expect(db.cacheCatalog).toHaveBeenCalledWith("parts_catalog_cache", parts, '"p1"');
  });

  it("sends the stored ETag and writes nothing on 304", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    mocked(partsCatalogApi.get).mockResolvedValue({ status: 304 });
    await storePartsCatalog(await fetchPartsCatalog());
    expect(db.getCachedCatalog).toHaveBeenCalledWith("parts_catalog_cache");
    expect(partsCatalogApi.get).toHaveBeenCalledWith('"p1"');
    expect(db.cacheCatalog).not.toHaveBeenCalled();
  });

  it("keeps the last good copy when the fetch fails", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    mocked(partsCatalogApi.get).mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));
    await expect(fetchPartsCatalog()).rejects.toThrow("offline");
    expect(db.cacheCatalog).not.toHaveBeenCalled();
    expect(await loadPartsCatalog()).toEqual(parts);
  });

  it("reads the cached list offline, and null before the first sync", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: parts, etag: '"p1"' });
    expect(await loadPartsCatalog()).toEqual(parts);
    mocked(db.getCachedCatalog).mockResolvedValue(null);
    expect(await loadPartsCatalog()).toBeNull();
  });
});

describe("the car list cache", () => {
  it("stores the body with its ETag on 200, nothing on 304", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: cars, etag: '"c0"' });
    mocked(carListApi.get).mockResolvedValueOnce({ status: 200, body: cars, etag: '"c1"' });
    await storeCarList(await fetchCarList());
    expect(carListApi.get).toHaveBeenCalledWith('"c0"');
    expect(db.cacheCatalog).toHaveBeenCalledWith("car_list_cache", cars, '"c1"');

    jest.mocked(db.cacheCatalog).mockClear();
    mocked(carListApi.get).mockResolvedValueOnce({ status: 304 });
    await storeCarList(await fetchCarList());
    expect(db.cacheCatalog).not.toHaveBeenCalled();
  });

  it("reads the cached car list offline", async () => {
    mocked(db.getCachedCatalog).mockResolvedValue({ value: cars, etag: '"c1"' });
    expect(await loadCarList()).toEqual(cars);
    expect(db.getCachedCatalog).toHaveBeenCalledWith("car_list_cache");
  });
});
