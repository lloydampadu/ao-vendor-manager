// The parsed parts list and car list kept in memory between reads (lib/parts-list.ts). It has no
// imports of its own, so lib/db.ts can forget it on logout without an import cycle.
//
// Each table has its own counter, bumped by a write to that table and by logout. A read that started
// before one of them must not put what it read into memory: the write's copy is newer, and after a
// logout there is nothing. A write to the other table leaves the read alone.
import type { CatalogCacheTable } from "./db";

const memory = new Map<CatalogCacheTable, unknown>();
const generations = new Map<CatalogCacheTable, number>();
const generationOf = (table: CatalogCacheTable) => generations.get(table) ?? 0;
const bump = (table: CatalogCacheTable) => generations.set(table, generationOf(table) + 1);

/** The parsed copy in memory, or undefined when the database must be read. */
export function remembered<T>(table: CatalogCacheTable): T | undefined {
  return memory.get(table) as T | undefined;
}

/** A sync wrote a new copy: it replaces the one in memory, even if a read is in flight. */
export function rememberWrite(table: CatalogCacheTable, value: unknown): void {
  bump(table);
  memory.set(table, value);
}

/** Starts a database read of this table; pass the token to `rememberRead` when it comes back. */
export const readToken = (table: CatalogCacheTable): number => generationOf(table);

/** What the read should answer: its own result if this table was not written or forgotten meanwhile, else what memory holds now. */
export function rememberRead<T>(table: CatalogCacheTable, value: T | null, token: number): T | null {
  if (token !== generationOf(table)) return remembered<T>(table) ?? null;
  if (value !== null) memory.set(table, value);
  return value;
}

/** Logout: the cache tables are wiped, so the parsed copies go too, and every read in flight is dropped. */
export function forgetCatalogs(): void {
  for (const table of ["parts_catalog_cache", "car_list_cache"] as const) bump(table);
  memory.clear();
}
