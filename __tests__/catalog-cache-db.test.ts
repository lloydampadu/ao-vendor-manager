// The v8 migration and the catalog cache helpers, run against a real SQLite engine (node's built-in one
// behind the few expo-sqlite calls db.ts makes), so the SQL itself is exercised, not a mock of it.
// Databases by name outlive a module reset, like the file on a phone outlives the app being reopened.
const mockDbs = new Map<string, unknown>();

jest.mock("expo-sqlite", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite");
  return {
    openDatabaseAsync: async (name: string) => {
      if (mockDbs.has(name)) return mockDbs.get(name);
      const raw = new DatabaseSync(":memory:");
      const db = {
        execAsync: async (sql: string) => { raw.exec(sql); },
        runAsync: async (sql: string, params: unknown[] = []) => { raw.prepare(sql).run(...params); },
        getFirstAsync: async (sql: string) => raw.prepare(sql).get() ?? null,
        withTransactionAsync: async (fn: () => Promise<void>) => { raw.exec("BEGIN"); try { await fn(); raw.exec("COMMIT"); } catch (e) { raw.exec("ROLLBACK"); throw e; } },
        withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => { raw.exec("BEGIN"); try { await fn(db); raw.exec("COMMIT"); } catch (e) { raw.exec("ROLLBACK"); throw e; } },
      };
      mockDbs.set(name, db);
      return db;
    },
  };
});

jest.mock("../lib/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

import { cacheCatalog, clearAllData, getCachedCatalog, getCatalogEtag, getDb } from "../lib/db";

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

  it("reads only the ETag, even when the stored document is damaged", async () => {
    await clearAllData();
    expect(await getCatalogEtag("parts_catalog_cache")).toBeNull();
    const db = await getDb();
    await db.runAsync(`INSERT OR REPLACE INTO parts_catalog_cache (id, json, etag, updated_at) VALUES (1, ?, ?, ?)`, ["{not json", '"x"', "t"]);
    expect(await getCatalogEtag("parts_catalog_cache")).toBe('"x"');
  });

  it("is wiped on logout with everything else", async () => {
    await cacheCatalog("parts_catalog_cache", { version: "a" }, '"a"');
    await cacheCatalog("car_list_cache", { version: "c" }, '"c"');
    await clearAllData();
    expect(await getCachedCatalog("parts_catalog_cache")).toBeNull();
    expect(await getCachedCatalog("car_list_cache")).toBeNull();
  });
});

describe("upgrading an existing install", () => {
  it("takes a v7 database to v8, keeping its rows and adding empty cache tables", async () => {
    mockDbs.clear();
    const open = () => {
      let loaded!: typeof import("../lib/db");
      jest.isolateModules(() => { loaded = require("../lib/db"); });
      return loaded;
    };

    // Build the v7 database: migrate fully, then take v8's tables away and rewind the version.
    const db = await open().getDb();
    await db.execAsync("DROP TABLE parts_catalog_cache; DROP TABLE car_list_cache; PRAGMA user_version = 7;");
    await db.runAsync("INSERT INTO battery_catalog_cache (id, json, updated_at) VALUES (1, ?, ?)", ['{"sizes":[]}', "t"]);

    // The app is reopened: a fresh module opens the same file.
    const reopened = open();
    const upgraded = await reopened.getDb();
    expect((await upgraded.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version).toBeGreaterThanOrEqual(8);
    expect(await reopened.getCachedBatteryCatalog()).toEqual({ sizes: [] });
    expect(await reopened.getCachedCatalog("parts_catalog_cache")).toBeNull();
    await reopened.cacheCatalog("car_list_cache", { version: "c" }, '"c"');
    expect(await reopened.getCachedCatalog("car_list_cache")).toEqual({ value: { version: "c" }, etag: '"c"' });
  });
});
