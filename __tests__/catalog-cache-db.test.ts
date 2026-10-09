// The v8 migration and the catalog cache helpers, run against a real SQLite engine (node's built-in one
// behind the few expo-sqlite calls db.ts makes), so the SQL itself is exercised, not a mock of it.
jest.mock("expo-sqlite", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite");
  return {
    openDatabaseAsync: async () => {
      const raw = new DatabaseSync(":memory:");
      const db = {
        execAsync: async (sql: string) => { raw.exec(sql); },
        runAsync: async (sql: string, params: unknown[] = []) => { raw.prepare(sql).run(...params); },
        getFirstAsync: async (sql: string) => raw.prepare(sql).get() ?? null,
        withTransactionAsync: async (fn: () => Promise<void>) => { raw.exec("BEGIN"); try { await fn(); raw.exec("COMMIT"); } catch (e) { raw.exec("ROLLBACK"); throw e; } },
        withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => { raw.exec("BEGIN"); try { await fn(db); raw.exec("COMMIT"); } catch (e) { raw.exec("ROLLBACK"); throw e; } },
      };
      return db;
    },
  };
});

jest.mock("../lib/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

import { cacheCatalog, clearAllData, getCachedCatalog, getDb } from "../lib/db";

describe("catalog cache in SQLite", () => {
  it("migrates to v8 and starts empty", async () => {
    const db = await getDb();
    const v = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
    expect(v?.user_version).toBeGreaterThanOrEqual(8);
    expect(await getCachedCatalog("parts_catalog_cache")).toBeNull();
    expect(await getCachedCatalog("car_list_cache")).toBeNull();
  });

  it("keeps one row per table: a second write replaces the first, with its ETag", async () => {
    await cacheCatalog("parts_catalog_cache", { version: "a", parts: [{ name: "Brake pads" }] }, '"a"');
    await cacheCatalog("parts_catalog_cache", { version: "b", parts: [] }, '"b"');
    await cacheCatalog("car_list_cache", { version: "c", makes: [] }, null);
    expect(await getCachedCatalog("parts_catalog_cache")).toEqual({ value: { version: "b", parts: [] }, etag: '"b"' });
    expect(await getCachedCatalog("car_list_cache")).toEqual({ value: { version: "c", makes: [] }, etag: null });
  });

  it("returns null, not a crash, for a damaged row, so the next sync refetches in full", async () => {
    const db = await getDb();
    await db.runAsync(`INSERT OR REPLACE INTO car_list_cache (id, json, etag, updated_at) VALUES (1, ?, ?, ?)`, ["{not json", '"x"', "t"]);
    expect(await getCachedCatalog("car_list_cache")).toBeNull();
  });

  it("is wiped on logout with everything else", async () => {
    await cacheCatalog("parts_catalog_cache", { version: "a" }, '"a"');
    await cacheCatalog("car_list_cache", { version: "c" }, '"c"');
    await clearAllData();
    expect(await getCachedCatalog("parts_catalog_cache")).toBeNull();
    expect(await getCachedCatalog("car_list_cache")).toBeNull();
  });
});
