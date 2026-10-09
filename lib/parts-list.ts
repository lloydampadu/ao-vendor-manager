// The shared parts list and car list on the phone (spec 2b, section 4): cached in SQLite with their
// ETag, refreshed on every sync, searched offline with the same code as the web and the API.
//
// A refresh is two steps so the sync can keep to one database writer: fetch* only talks to the network
// (it reads the stored ETag first) and runs in the sync's parallel pull phase; store* writes afterwards.
import { carListApi, partsCatalogApi, type ApiCarList, type EtagResult } from "./api";
import { cacheCatalog, getCachedCatalog, type CatalogCacheTable } from "./db";
import type { PartsCatalog } from "./parts-search.generated";

export { findPartExact, positionTypeFor, searchParts } from "./parts-search.generated";

async function fetchCatalog<T>(table: CatalogCacheTable, get: (etag: string | null) => Promise<EtagResult<T>>): Promise<EtagResult<T>> {
  const cached = await getCachedCatalog<T>(table);
  return get(cached?.etag ?? null);
}

/** A 304 keeps the cached copy; a fetch that threw never reaches here, so the last good copy stays. */
async function storeCatalog<T>(table: CatalogCacheTable, res: EtagResult<T>): Promise<void> {
  if (res.status === 200) await cacheCatalog(table, res.body, res.etag);
}

export const fetchPartsCatalog = () => fetchCatalog("parts_catalog_cache", partsCatalogApi.get);
export const storePartsCatalog = (res: EtagResult<PartsCatalog>) => storeCatalog("parts_catalog_cache", res);
export const fetchCarList = () => fetchCatalog("car_list_cache", carListApi.get);
export const storeCarList = (res: EtagResult<ApiCarList>) => storeCatalog("car_list_cache", res);

export async function loadPartsCatalog(): Promise<PartsCatalog | null> {
  return (await getCachedCatalog<PartsCatalog>("parts_catalog_cache"))?.value ?? null;
}

export async function loadCarList(): Promise<ApiCarList | null> {
  return (await getCachedCatalog<ApiCarList>("car_list_cache"))?.value ?? null;
}
