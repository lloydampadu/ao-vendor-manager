// The shared parts list and car list on the phone (spec 2b, section 4): cached in SQLite with their
// ETag, refreshed on every sync, searched offline with the same code as the web and the API.
//
// A refresh is two steps so the sync can keep to one database writer: fetch* only talks to the network
// (it reads the stored ETag first) and runs in the sync's parallel pull phase; store* writes afterwards.
// The parsed documents are kept in memory (about 130 KB for the parts list) until the next write.
import { carListApi, partsCatalogApi, type ApiCarList, type EtagResult } from "./api";
import { cacheCatalog, getCachedCatalog, getCatalogEtag, type CatalogCacheTable } from "./db";
import type { PartsCatalog } from "./parts-search.generated";

export { findPartExact, positionTypeFor, searchParts } from "./parts-search.generated";

const memory = new Map<CatalogCacheTable, unknown>();

async function fetchCatalog<T>(table: CatalogCacheTable, get: (etag: string | null) => Promise<EtagResult<T>>): Promise<EtagResult<T>> {
  return get(await getCatalogEtag(table));
}

/** A 304 keeps the cached copy; a fetch that threw never reaches here, so the last good copy stays. */
async function storeCatalog<T>(table: CatalogCacheTable, res: EtagResult<T>): Promise<void> {
  if (res.status !== 200) return;
  await cacheCatalog(table, res.body, res.etag);
  memory.delete(table);
}

async function loadCatalog<T>(table: CatalogCacheTable): Promise<T | null> {
  if (memory.has(table)) return memory.get(table) as T;
  const cached = await getCachedCatalog<T>(table);
  if (cached) memory.set(table, cached.value);
  return cached?.value ?? null;
}

export const fetchPartsCatalog = () => fetchCatalog("parts_catalog_cache", partsCatalogApi.get);
export const storePartsCatalog = (res: EtagResult<PartsCatalog>) => storeCatalog("parts_catalog_cache", res);
export const fetchCarList = () => fetchCatalog("car_list_cache", carListApi.get);
export const storeCarList = (res: EtagResult<ApiCarList>) => storeCatalog("car_list_cache", res);

export const loadPartsCatalog = () => loadCatalog<PartsCatalog>("parts_catalog_cache");
export const loadCarList = () => loadCatalog<ApiCarList>("car_list_cache");
