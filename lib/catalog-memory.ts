// The parsed parts list and car list kept in memory between reads (lib/parts-list.ts). It has no
// imports of its own, so lib/db.ts can forget it on logout without an import cycle.
//
// Every write and every logout bumps one counter. A read that started before one of them must not
// put what it read into memory: the write's copy is newer, and after a logout there is nothing.
import type { CatalogCacheTable } from "./db";

const memory = new Map<CatalogCacheTable, unknown>();
let generation = 0;

/** The parsed copy in memory, or undefined when the database must be read. */
export function remembered<T>(table: CatalogCacheTable): T | undefined {
  return memory.get(table) as T | undefined;
}

/** A sync wrote a new copy: it replaces the one in memory, even if a read is in flight. */
export function rememberWrite(table: CatalogCacheTable, value: unknown): void {
  generation += 1;
  memory.set(table, value);
}

/** Starts a database read; pass the token to `rememberRead` when it comes back. */
export const readToken = (): number => generation;

/** What the read should answer: its own result if nothing was written or forgotten meanwhile, else what memory holds now. */
export function rememberRead<T>(table: CatalogCacheTable, value: T | null, token: number): T | null {
  if (token !== generation) return remembered<T>(table) ?? null;
  if (value !== null) memory.set(table, value);
  return value;
}

/** Logout: the cache tables are wiped, so the parsed copies go too. */
export function forgetCatalogs(): void {
  generation += 1;
  memory.clear();
}
