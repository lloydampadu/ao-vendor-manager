import * as SQLite from "expo-sqlite";
import type { ApiFluidCatalog } from "./api";
import { createLogger } from "./logger";

const log = createLogger("db");

// ─── Row types ───────────────────────────────────────────────────────────────

export type Assignment = {
  id: string;
  request_id: string;
  status: string;
  notified_at: string | null;
  updated_at: string;
  request_data: string; // JSON blob of the request
  quote_data: string | null; // JSON blob of the vendor's quote (server shape or queued payload)
  fee_paid: number; // 1 if customer paid sourcing fee, 0 otherwise
};

export type QuoteQueueItem = {
  id: string;
  assignment_id: string;
  payload: string; // JSON QuotePayload
  synced: number; // 0 or 1
  error: string | null;
  created_at: string;
};

export type DeclineQueueItem = {
  id: string;
  assignment_id: string;
  synced: number;
  error: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  stage: string;
  won_items: string; // JSON: { partName; condition; earnGhs; photos }[]
  total_earn_ghs: number;
  request_data: string; // JSON
  handed_over_at: string | null;
  handover_photos: string; // JSON string[]
  updated_at: string;
  payout_status: string; // "UNPAID" | "PAID"
  payout_method: string | null; // "MOMO" | "CASH"
  payout_amount_ghs: number | null;
  payout_at: string | null;
  payout_ref: string | null;
};

export type StageQueueItem = {
  id: string;
  order_id: string;
  stage: string;
  photos: string; // JSON string[]
  location: string | null; // JSON { latitude; longitude } or null
  synced: number;
  error: string | null;
  created_at: string;
};

export type TyreListing = {
  id: string;
  server_id: string | null; // null until synced to API
  width: number;
  height: number;
  diameter: number;
  brand: string;
  model: string;
  condition: string;
  price_ghs: number;
  photos: string; // JSON string[]
  in_stock: number; // 0 or 1
  tyre_size_id: string | null; // catalog size; null = free-text, an admin links it later
  price_advice: string | null; // JSON { lowestGhs, maxGhs } from the server, or null
  proposed: number; // 1 = proposed for the catalog, waiting for an admin
  updated_at: string;
};

export type LightListing = {
  id: string;
  server_id: string | null;
  light_type: string;
  side: string;
  make: string;
  model: string;
  year: string;
  condition: string;
  price_ghs: number;
  photos: string; // JSON string[]
  in_stock: number;
  updated_at: string;
};

export type FluidListing = {
  id: string;
  server_id: string | null;
  fluid_product_id: string | null; // null until the server resolves the pick
  kind_id: string;
  kind: string;
  brand_id: string | null; // null = typed ("Not in the list")
  brand: string;
  product: string;
  grade: string; // "" when not used
  coolant_colour: string;
  coolant_mix: string;
  size_label: string;
  status: string; // "APPROVED" | "PENDING" (server) | "LOCAL" (not sent yet)
  review_status: string; // "OK" | "PRICE_CHECK"
  price_ghs: number;
  photos: string; // JSON string[]
  in_stock: number;
  price_advice: string | null; // JSON { lowestGhs, maxGhs } from the server, or null
  updated_at: string;
};

export type ListingOp = "create" | "update" | "delete";

export type ListingQueueItem = {
  id: string;
  op: ListingOp;
  listing_id: string;
  payload: string; // JSON blob
  synced: number;
  error: string | null;
  created_at: string;
};

export type CatalogModel = { name: string; slug: string; type: string | null };
export type CatalogBrand = {
  brandName: string;
  brandSlug: string;
  tier: string;
  models: CatalogModel[];
};

export type QuoteSyncStatus = "pending" | "synced" | "error";

// ─── Connection + migrations ─────────────────────────────────────────────────
//
// The database opens once and migrates itself on first use, so every caller
// (screens, sync, badge counts) can assume the schema exists. Migrations are
// append-only and keyed by PRAGMA user_version; never edit a shipped step —
// add a new one.

const MIGRATIONS: string[] = [
  // v1 — baseline schema (matches what shipped before versioning existed; every
  // statement is IF NOT EXISTS so upgrading installs are a no-op here).
  `
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    notified_at TEXT,
    updated_at TEXT NOT NULL,
    request_data TEXT NOT NULL,
    quote_data TEXT,
    fee_paid INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS quote_queue (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS decline_queue (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products_cache (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tyre_catalog_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    stage TEXT NOT NULL,
    won_items TEXT NOT NULL,
    total_earn_ghs INTEGER NOT NULL DEFAULT 0,
    request_data TEXT NOT NULL,
    handed_over_at TEXT,
    handover_photos TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stage_queue (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    photos TEXT NOT NULL DEFAULT '[]',
    location TEXT,
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tyre_listings (
    id TEXT PRIMARY KEY,
    server_id TEXT,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    diameter INTEGER NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    condition TEXT NOT NULL,
    price_ghs INTEGER NOT NULL,
    photos TEXT NOT NULL DEFAULT '[]',
    in_stock INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tyre_listing_queue (
    id TEXT PRIMARY KEY,
    op TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS light_listings (
    id TEXT PRIMARY KEY,
    server_id TEXT,
    light_type TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'N/A',
    make TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL,
    price_ghs INTEGER NOT NULL,
    photos TEXT NOT NULL DEFAULT '[]',
    in_stock INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS light_listing_queue (
    id TEXT PRIMARY KEY,
    op TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  `,
  // v2 — indexes for the hot queries (segment lists, queue flushes, badge count).
  `
  CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status, updated_at);
  CREATE INDEX IF NOT EXISTS idx_quote_queue_synced ON quote_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_quote_queue_assignment ON quote_queue(assignment_id);
  CREATE INDEX IF NOT EXISTS idx_decline_queue_synced ON decline_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_stage_queue_synced ON stage_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_stage ON orders(stage);
  CREATE INDEX IF NOT EXISTS idx_tyre_queue_synced ON tyre_listing_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_tyre_listings_server ON tyre_listings(server_id);
  CREATE INDEX IF NOT EXISTS idx_light_queue_synced ON light_listing_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_light_listings_server ON light_listings(server_id);
  `,
  // v3 — manual vendor payouts recorded by admin, shown on each order.
  `
  ALTER TABLE orders ADD COLUMN payout_status TEXT NOT NULL DEFAULT 'UNPAID';
  ALTER TABLE orders ADD COLUMN payout_method TEXT;
  ALTER TABLE orders ADD COLUMN payout_amount_ghs INTEGER;
  ALTER TABLE orders ADD COLUMN payout_at TEXT;
  ALTER TABLE orders ADD COLUMN payout_ref TEXT;
  `,
  // v4 — tyre listings link to a catalog size and carry the server's price advice (JSON or null).
  `
  ALTER TABLE tyre_listings ADD COLUMN tyre_size_id TEXT;
  ALTER TABLE tyre_listings ADD COLUMN price_advice TEXT;
  `,
  // v5 — a tyre the vendor proposed for the catalog ("Not in the list"); 1 until an admin links it.
  `
  ALTER TABLE tyre_listings ADD COLUMN proposed INTEGER NOT NULL DEFAULT 0;
  `,
  // v6 — oils & fluids listings, offline-first like tyres and lamps, and the cached fluid catalog.
  `
  CREATE TABLE IF NOT EXISTS fluid_listings (
    id TEXT PRIMARY KEY,
    server_id TEXT,
    fluid_product_id TEXT,
    kind_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    brand_id TEXT,
    brand TEXT NOT NULL,
    product TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT '',
    coolant_colour TEXT NOT NULL DEFAULT '',
    coolant_mix TEXT NOT NULL DEFAULT '',
    size_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'LOCAL',
    review_status TEXT NOT NULL DEFAULT 'OK',
    price_ghs INTEGER NOT NULL,
    photos TEXT NOT NULL DEFAULT '[]',
    in_stock INTEGER NOT NULL DEFAULT 1,
    price_advice TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fluid_listing_queue (
    id TEXT PRIMARY KEY,
    op TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    synced INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fluid_catalog_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fluid_queue_synced ON fluid_listing_queue(synced, created_at);
  CREATE INDEX IF NOT EXISTS idx_fluid_listings_server ON fluid_listings(server_id);
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("vendor.db");
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  // Installs that pre-date versioning have user_version 0 but already hold the
  // v1 tables. The legacy fee_paid ALTER is tolerated because v1 is IF NOT EXISTS.
  await db.execAsync("ALTER TABLE assignments ADD COLUMN fee_paid INTEGER NOT NULL DEFAULT 0").catch(() => {});

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = row?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRATIONS[i]);
      await tx.execAsync(`PRAGMA user_version = ${i + 1}`);
    });
    version = i + 1;
    log.debug("migrated", { to: version });
  }
  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err) => {
      dbPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return dbPromise;
}

/** Opens the database and runs pending migrations. Safe to call many times. */
export async function initDb(): Promise<void> {
  await getDb();
}

/**
 * Wipes every table. Called on logout so the next vendor to sign in on this
 * phone never sees the previous vendor's requests, orders or listings.
 */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of [
      "assignments", "quote_queue", "decline_queue", "products_cache", "tyre_catalog_cache",
      "orders", "stage_queue", "tyre_listings", "tyre_listing_queue", "light_listings", "light_listing_queue",
      "fluid_listings", "fluid_listing_queue", "fluid_catalog_cache",
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });
}

// ─── Assignments ─────────────────────────────────────────────────────────────

const UPSERT_ASSIGNMENT_SQL = `
  INSERT INTO assignments (id, request_id, status, notified_at, updated_at, request_data, quote_data, fee_paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    notified_at = excluded.notified_at,
    updated_at = excluded.updated_at,
    request_data = excluded.request_data,
    quote_data = excluded.quote_data,
    fee_paid = excluded.fee_paid`;

function assignmentParams(a: Assignment): SQLite.SQLiteBindValue[] {
  return [a.id, a.request_id, a.status, a.notified_at, a.updated_at, a.request_data, a.quote_data, a.fee_paid];
}

export async function upsertAssignment(a: Assignment): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPSERT_ASSIGNMENT_SQL, assignmentParams(a));
}

export async function upsertAssignments(rows: Assignment[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(UPSERT_ASSIGNMENT_SQL);
    try {
      for (const a of rows) await stmt.executeAsync(assignmentParams(a));
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function getAssignments(statuses?: string[]): Promise<Assignment[]> {
  const db = await getDb();
  if (statuses && statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(",");
    return db.getAllAsync<Assignment>(
      `SELECT * FROM assignments WHERE status IN (${placeholders}) ORDER BY updated_at DESC`,
      statuses,
    );
  }
  return db.getAllAsync<Assignment>(`SELECT * FROM assignments ORDER BY updated_at DESC`);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const db = await getDb();
  return db.getFirstAsync<Assignment>(`SELECT * FROM assignments WHERE id = ?`, [id]);
}

export async function deleteAssignment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM assignments WHERE id = ?`, [id]);
}

/** Deletes assignments the server no longer returns (keeps any id in `keep`). */
export async function pruneAssignments(keep: Set<string>): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM assignments`);
  const gone = rows.map((r) => r.id).filter((id) => !keep.has(id));
  if (gone.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const id of gone) await db.runAsync(`DELETE FROM assignments WHERE id = ?`, [id]);
  });
}

export async function updateAssignmentStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE assignments SET status = ? WHERE id = ?`, [status, id]);
}

export async function updateAssignmentQuote(id: string, quoteData: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE assignments SET status = 'QUOTED', quote_data = ? WHERE id = ?`, [quoteData, id]);
}

// ─── Quote queue ─────────────────────────────────────────────────────────────

export async function enqueueQuote(q: QuoteQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO quote_queue (id, assignment_id, payload, synced, error, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [q.id, q.assignment_id, q.payload, q.synced, q.error, q.created_at],
  );
}

export async function getPendingQuotes(): Promise<QuoteQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<QuoteQueueItem>(`SELECT * FROM quote_queue WHERE synced = 0 ORDER BY created_at ASC`);
}

export async function markQuoteSynced(id: string, error: string | null = null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE quote_queue SET synced = 1, error = ? WHERE id = ?`, [error, id]);
}

export async function markQuoteError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE quote_queue SET error = ? WHERE id = ?`, [error, id]);
}

export async function getQuoteQueueItem(assignment_id: string): Promise<QuoteQueueItem | null> {
  const db = await getDb();
  return db.getFirstAsync<QuoteQueueItem>(
    `SELECT * FROM quote_queue WHERE assignment_id = ? ORDER BY created_at DESC LIMIT 1`,
    [assignment_id],
  );
}

export function queueStatusOf(item: { synced: number; error: string | null }): QuoteSyncStatus {
  return item.synced ? "synced" : item.error ? "error" : "pending";
}

export async function getAllQuoteQueueStatusMap(): Promise<Record<string, QuoteSyncStatus>> {
  const db = await getDb();
  const items = await db.getAllAsync<QuoteQueueItem>(`SELECT * FROM quote_queue ORDER BY created_at ASC`);
  const map: Record<string, QuoteSyncStatus> = {};
  // Latest row per assignment wins — the list is ordered oldest→newest.
  for (const item of items) map[item.assignment_id] = queueStatusOf(item);
  return map;
}

/** Assignment ids that have a local action (quote or decline) not yet accepted by the server. */
export async function getAssignmentIdsWithPendingActions(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ assignment_id: string }>(
    `SELECT assignment_id FROM quote_queue WHERE synced = 0
     UNION SELECT assignment_id FROM decline_queue WHERE synced = 0`,
  );
  return new Set(rows.map((r) => r.assignment_id));
}

// ─── Decline queue ───────────────────────────────────────────────────────────

export async function enqueueDecline(d: DeclineQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO decline_queue (id, assignment_id, synced, error, created_at) VALUES (?, ?, ?, ?, ?)`,
    [d.id, d.assignment_id, d.synced, d.error, d.created_at],
  );
}

export async function getPendingDeclines(): Promise<DeclineQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<DeclineQueueItem>(`SELECT * FROM decline_queue WHERE synced = 0 ORDER BY created_at ASC`);
}

export async function markDeclineSynced(id: string, error: string | null = null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE decline_queue SET synced = 1, error = ? WHERE id = ?`, [error, id]);
}

export async function markDeclineError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE decline_queue SET error = ? WHERE id = ?`, [error, id]);
}

// ─── Products cache (generic parts are online-only; this is a read cache) ────

export async function cacheProducts(products: { id: string }[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM products_cache`);
    for (const p of products) {
      await db.runAsync(`INSERT INTO products_cache (id, data) VALUES (?, ?)`, [p.id, JSON.stringify(p)]);
    }
  });
}

export async function getCachedProducts<T>(): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(`SELECT data FROM products_cache`);
  return rows.flatMap((r) => {
    try { return [JSON.parse(r.data) as T]; } catch { return []; }
  });
}

// ─── Tyre catalog cache ──────────────────────────────────────────────────────

export async function cacheTyreCatalog(brands: CatalogBrand[]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO tyre_catalog_cache (id, json, updated_at) VALUES (1, ?, ?)`,
    [JSON.stringify(brands), new Date().toISOString()],
  );
}

export async function getCachedTyreCatalog(): Promise<CatalogBrand[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(`SELECT json FROM tyre_catalog_cache WHERE id = 1`);
  if (!row) return [];
  try { return JSON.parse(row.json) as CatalogBrand[]; } catch { return []; }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

const UPSERT_ORDER_SQL = `
  INSERT INTO orders (id, stage, won_items, total_earn_ghs, request_data, handed_over_at, handover_photos, updated_at,
                      payout_status, payout_method, payout_amount_ghs, payout_at, payout_ref)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    stage = excluded.stage,
    won_items = excluded.won_items,
    total_earn_ghs = excluded.total_earn_ghs,
    request_data = excluded.request_data,
    handed_over_at = excluded.handed_over_at,
    handover_photos = excluded.handover_photos,
    updated_at = excluded.updated_at,
    payout_status = excluded.payout_status,
    payout_method = excluded.payout_method,
    payout_amount_ghs = excluded.payout_amount_ghs,
    payout_at = excluded.payout_at,
    payout_ref = excluded.payout_ref`;

export async function upsertOrders(rows: Order[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(UPSERT_ORDER_SQL);
    try {
      for (const o of rows) {
        await stmt.executeAsync([
          o.id, o.stage, o.won_items, o.total_earn_ghs, o.request_data, o.handed_over_at, o.handover_photos, o.updated_at,
          o.payout_status, o.payout_method, o.payout_amount_ghs, o.payout_at, o.payout_ref,
        ]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function pruneOrders(keep: Set<string>): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM orders`);
  const gone = rows.map((r) => r.id).filter((id) => !keep.has(id));
  if (gone.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const id of gone) await db.runAsync(`DELETE FROM orders WHERE id = ?`, [id]);
  });
}

export async function getOrders(): Promise<Order[]> {
  const db = await getDb();
  return db.getAllAsync<Order>(`SELECT * FROM orders ORDER BY updated_at DESC`);
}

export async function getOrder(id: string): Promise<Order | null> {
  const db = await getDb();
  return db.getFirstAsync<Order>(`SELECT * FROM orders WHERE id = ?`, [id]);
}

export async function countOrdersByStage(stage: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE stage = ?`, [stage]);
  return row?.n ?? 0;
}

export async function applyLocalStage(orderId: string, stage: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE orders SET stage = ? WHERE id = ?`, [stage, orderId]);
}

// ─── Stage queue ─────────────────────────────────────────────────────────────

export async function enqueueStage(s: StageQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stage_queue (id, order_id, stage, photos, location, synced, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.order_id, s.stage, s.photos, s.location, s.synced, s.error, s.created_at],
  );
}

export async function getPendingStages(): Promise<StageQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<StageQueueItem>(`SELECT * FROM stage_queue WHERE synced = 0 ORDER BY created_at ASC`);
}

export async function markStageSynced(id: string, error: string | null = null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE stage_queue SET synced = 1, error = ? WHERE id = ?`, [error, id]);
}

export async function markStageError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE stage_queue SET error = ? WHERE id = ?`, [error, id]);
}

// ─── Listings (tyres + lights share one access pattern) ──────────────────────
//
// Both listing kinds are offline-first: a local row keyed by a temporary
// "local-…" id until the create flushes, then re-keyed to the server id.

export type ListingKind = "tyre" | "light" | "fluid";

type ListingTables = { rows: string; queue: string };

const LISTING_TABLES: Record<ListingKind, ListingTables> = {
  tyre: { rows: "tyre_listings", queue: "tyre_listing_queue" },
  light: { rows: "light_listings", queue: "light_listing_queue" },
  fluid: { rows: "fluid_listings", queue: "fluid_listing_queue" },
};

export async function upsertTyreListing(t: TyreListing): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tyre_listings (id, server_id, width, height, diameter, brand, model, condition, price_ghs, photos, in_stock, tyre_size_id, price_advice, proposed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       server_id = excluded.server_id, width = excluded.width, height = excluded.height, diameter = excluded.diameter,
       brand = excluded.brand, model = excluded.model, condition = excluded.condition, price_ghs = excluded.price_ghs,
       photos = excluded.photos, in_stock = excluded.in_stock, tyre_size_id = excluded.tyre_size_id,
       price_advice = excluded.price_advice, proposed = excluded.proposed, updated_at = excluded.updated_at`,
    [t.id, t.server_id, t.width, t.height, t.diameter, t.brand, t.model, t.condition, t.price_ghs, t.photos, t.in_stock, t.tyre_size_id, t.price_advice, t.proposed, t.updated_at],
  );
}

export async function upsertLightListing(l: LightListing): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO light_listings (id, server_id, light_type, side, make, model, year, condition, price_ghs, photos, in_stock, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       server_id = excluded.server_id, light_type = excluded.light_type, side = excluded.side, make = excluded.make,
       model = excluded.model, year = excluded.year, condition = excluded.condition, price_ghs = excluded.price_ghs,
       photos = excluded.photos, in_stock = excluded.in_stock, updated_at = excluded.updated_at`,
    [l.id, l.server_id, l.light_type, l.side, l.make, l.model, l.year, l.condition, l.price_ghs, l.photos, l.in_stock, l.updated_at],
  );
}

const FLUID_COLS = ["id", "server_id", "fluid_product_id", "kind_id", "kind", "brand_id", "brand", "product", "grade", "coolant_colour", "coolant_mix",
  "size_label", "status", "review_status", "price_ghs", "photos", "in_stock", "price_advice", "updated_at"] as const;

export async function upsertFluidListing(l: FluidListing): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO fluid_listings (${FLUID_COLS.join(", ")}) VALUES (${FLUID_COLS.map(() => "?").join(", ")})
     ON CONFLICT(id) DO UPDATE SET ${FLUID_COLS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`,
    FLUID_COLS.map((c) => l[c]),
  );
}

export async function getFluidListings(): Promise<FluidListing[]> {
  const db = await getDb();
  return db.getAllAsync<FluidListing>(`SELECT * FROM fluid_listings ORDER BY updated_at DESC`);
}

export async function cacheFluidCatalog(c: ApiFluidCatalog): Promise<void> {
  const db = await getDb();
  await db.runAsync(`INSERT OR REPLACE INTO fluid_catalog_cache (id, json, updated_at) VALUES (1, ?, ?)`, [JSON.stringify(c), new Date().toISOString()]);
}

export async function getCachedFluidCatalog(): Promise<ApiFluidCatalog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(`SELECT json FROM fluid_catalog_cache WHERE id = 1`);
  if (!row) return null;
  try { return JSON.parse(row.json) as ApiFluidCatalog; } catch { return null; }
}

export async function getTyreListings(): Promise<TyreListing[]> {
  const db = await getDb();
  return db.getAllAsync<TyreListing>(`SELECT * FROM tyre_listings ORDER BY updated_at DESC`);
}

export async function getLightListings(): Promise<LightListing[]> {
  const db = await getDb();
  return db.getAllAsync<LightListing>(`SELECT * FROM light_listings ORDER BY updated_at DESC`);
}

export async function deleteListing(kind: ListingKind, id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${LISTING_TABLES[kind].rows} WHERE id = ?`, [id]);
}

/**
 * Removes rows that point at the same server listing but are keyed by a
 * different (temporary local) id — leftovers from a create flush that was
 * interrupted between the API call and the local re-key.
 */
export async function deleteDuplicateListings(kind: ListingKind, serverId: string, keepId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${LISTING_TABLES[kind].rows} WHERE server_id = ? AND id != ?`, [serverId, keepId]);
}

/**
 * Deletes synced listings the server no longer returns. Local-only rows
 * (server_id NULL) and rows with queued ops are always kept.
 */
export async function pruneListings(kind: ListingKind, keepServerIds: Set<string>, keepLocalIds: Set<string>): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; server_id: string | null }>(`SELECT id, server_id FROM ${LISTING_TABLES[kind].rows}`);
  const gone = rows.filter((r) => r.server_id && !keepServerIds.has(r.server_id) && !keepLocalIds.has(r.id));
  if (gone.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const r of gone) await db.runAsync(`DELETE FROM ${LISTING_TABLES[kind].rows} WHERE id = ?`, [r.id]);
  });
}

/** Local listing ids with a create/update/delete that hasn't reached the server. */
export async function getListingIdsWithPendingOps(kind: ListingKind): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ listing_id: string }>(
    `SELECT DISTINCT listing_id FROM ${LISTING_TABLES[kind].queue} WHERE synced = 0`,
  );
  return new Set(rows.map((r) => r.listing_id));
}

export async function enqueueListingOp(kind: ListingKind, q: ListingQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ${LISTING_TABLES[kind].queue} (id, op, listing_id, payload, synced, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [q.id, q.op, q.listing_id, q.payload, q.synced, q.error, q.created_at],
  );
}

export async function getPendingListingOps(kind: ListingKind): Promise<ListingQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<ListingQueueItem>(
    `SELECT * FROM ${LISTING_TABLES[kind].queue} WHERE synced = 0 ORDER BY created_at ASC`,
  );
}

export async function markListingOpSynced(kind: ListingKind, id: string, error: string | null = null): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE ${LISTING_TABLES[kind].queue} SET synced = 1, error = ? WHERE id = ?`, [error, id]);
}

export async function markListingOpError(kind: ListingKind, id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE ${LISTING_TABLES[kind].queue} SET error = ? WHERE id = ?`, [error, id]);
}

/** Count of every queued write still waiting for the server, for the sync badge. */
export async function countPendingWrites(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`
    SELECT
      (SELECT COUNT(*) FROM quote_queue WHERE synced = 0) +
      (SELECT COUNT(*) FROM decline_queue WHERE synced = 0) +
      (SELECT COUNT(*) FROM stage_queue WHERE synced = 0) +
      (SELECT COUNT(*) FROM tyre_listing_queue WHERE synced = 0) +
      (SELECT COUNT(*) FROM light_listing_queue WHERE synced = 0) +
      (SELECT COUNT(*) FROM fluid_listing_queue WHERE synced = 0) AS n`);
  return row?.n ?? 0;
}
