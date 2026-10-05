import * as SQLite from "expo-sqlite";

export type Assignment = {
  id: string;
  request_id: string;
  status: string;
  notified_at: string | null;
  updated_at: string;
  request_data: string; // JSON blob
  quote_data: string | null; // JSON blob
  fee_paid: number; // 1 if customer paid sourcing fee, 0 otherwise
};

export type QuoteQueueItem = {
  id: string;
  assignment_id: string;
  payload: string; // JSON blob
  synced: number; // 0 or 1
  error: string | null;
  created_at: string;
};

export type DeclineQueueItem = {
  id: string;
  assignment_id: string;
  synced: number; // 0 or 1
  error: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  stage: string;
  won_items: string; // JSON: { partName; condition; earnGhs }[]
  total_earn_ghs: number;
  request_data: string; // JSON
  handed_over_at: string | null;
  handover_photos: string; // JSON string[]
  updated_at: string;
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

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!_db) _db = await SQLite.openDatabaseAsync("vendor.db");
  return _db;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  // Migrate existing installs that don't have fee_paid column yet.
  await db.execAsync(`ALTER TABLE assignments ADD COLUMN fee_paid INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await db.execAsync(`
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
  `);
}

export async function upsertAssignment(a: Assignment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO assignments (id, request_id, status, notified_at, updated_at, request_data, quote_data, fee_paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       notified_at = excluded.notified_at,
       updated_at = excluded.updated_at,
       request_data = excluded.request_data,
       quote_data = excluded.quote_data,
       fee_paid = excluded.fee_paid`,
    [a.id, a.request_id, a.status, a.notified_at, a.updated_at, a.request_data, a.quote_data, a.fee_paid],
  );
}

export async function getAssignments(status?: string): Promise<Assignment[]> {
  const db = await getDb();
  if (status) {
    return db.getAllAsync<Assignment>(
      `SELECT * FROM assignments WHERE status = ? ORDER BY updated_at DESC`,
      [status],
    );
  }
  return db.getAllAsync<Assignment>(
    `SELECT * FROM assignments ORDER BY updated_at DESC`,
  );
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const db = await getDb();
  return db.getFirstAsync<Assignment>(
    `SELECT * FROM assignments WHERE id = ?`,
    [id],
  );
}

export async function deleteAssignment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM assignments WHERE id = ?`, [id]);
}

export async function enqueueQuote(q: QuoteQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO quote_queue (id, assignment_id, payload, synced, error, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [q.id, q.assignment_id, q.payload, q.synced, q.error, q.created_at],
  );
}

export async function getPendingQuotes(): Promise<QuoteQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<QuoteQueueItem>(
    `SELECT * FROM quote_queue WHERE synced = 0 ORDER BY created_at ASC`,
  );
}

export async function markQuoteSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE quote_queue SET synced = 1, error = NULL WHERE id = ?`, [id]);
}

export async function markQuoteError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE quote_queue SET error = ? WHERE id = ?`, [error, id]);
}

export async function enqueueDecline(d: DeclineQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO decline_queue (id, assignment_id, synced, error, created_at) VALUES (?, ?, ?, ?, ?)`,
    [d.id, d.assignment_id, d.synced, d.error, d.created_at],
  );
}

export async function getPendingDeclines(): Promise<DeclineQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<DeclineQueueItem>(
    `SELECT * FROM decline_queue WHERE synced = 0 ORDER BY created_at ASC`,
  );
}

export async function markDeclineSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE decline_queue SET synced = 1, error = NULL WHERE id = ?`, [id]);
}

export async function markDeclineError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE decline_queue SET error = ? WHERE id = ?`, [error, id]);
}

export type QuoteSyncStatus = "pending" | "synced" | "error";

export async function getQuoteQueueItem(assignment_id: string): Promise<QuoteQueueItem | null> {
  const db = await getDb();
  return db.getFirstAsync<QuoteQueueItem>(
    `SELECT * FROM quote_queue WHERE assignment_id = ? ORDER BY created_at DESC LIMIT 1`,
    [assignment_id],
  );
}

export async function getAllQuoteQueueStatusMap(): Promise<Record<string, QuoteSyncStatus>> {
  const db = await getDb();
  const items = await db.getAllAsync<QuoteQueueItem>(`SELECT * FROM quote_queue`);
  const map: Record<string, QuoteSyncStatus> = {};
  for (const item of items) {
    const status: QuoteSyncStatus = item.synced ? "synced" : item.error ? "error" : "pending";
    const existing = map[item.assignment_id];
    // pending beats error beats synced — show worst state if multiple rows
    if (!existing || status === "pending" || (existing === "synced" && status === "error")) {
      map[item.assignment_id] = status;
    }
  }
  return map;
}

export async function updateAssignmentStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE assignments SET status = ? WHERE id = ?`, [status, id]);
}

export async function updateAssignmentQuote(id: string, quoteData: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE assignments SET status = 'QUOTED', quote_data = ? WHERE id = ?`,
    [quoteData, id],
  );
}

export async function cacheProducts(products: unknown[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM products_cache`);
    for (const p of products) {
      const row = p as { id: string };
      await db.runAsync(
        `INSERT INTO products_cache (id, data) VALUES (?, ?)`,
        [row.id, JSON.stringify(p)],
      );
    }
  });
}

export async function getCachedProducts<T>(): Promise<T[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; data: string }>(`SELECT data FROM products_cache`);
  return rows.map((r) => JSON.parse(r.data) as T);
}

export type CatalogModel = { name: string; slug: string; type: string | null };
export type CatalogBrand = {
  brandName: string;
  brandSlug: string;
  tier: string;
  models: CatalogModel[];
};

export async function cacheTyreCatalog(brands: CatalogBrand[]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO tyre_catalog_cache (id, json, updated_at) VALUES (1, ?, ?)`,
    [JSON.stringify(brands), new Date().toISOString()],
  );
}

export async function getCachedTyreCatalog(): Promise<CatalogBrand[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(
    `SELECT json FROM tyre_catalog_cache WHERE id = 1`,
  );
  if (!row) return [];
  try {
    return JSON.parse(row.json) as CatalogBrand[];
  } catch {
    return [];
  }
}

export async function upsertOrder(o: Order): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO orders (id, stage, won_items, total_earn_ghs, request_data, handed_over_at, handover_photos, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       stage = excluded.stage,
       won_items = excluded.won_items,
       total_earn_ghs = excluded.total_earn_ghs,
       request_data = excluded.request_data,
       handed_over_at = excluded.handed_over_at,
       handover_photos = excluded.handover_photos,
       updated_at = excluded.updated_at`,
    [o.id, o.stage, o.won_items, o.total_earn_ghs, o.request_data, o.handed_over_at, o.handover_photos, o.updated_at],
  );
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

export async function enqueueStage(s: StageQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stage_queue (id, order_id, stage, photos, location, synced, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.order_id, s.stage, s.photos, s.location, s.synced, s.error, s.created_at],
  );
}

export async function getPendingStages(): Promise<StageQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<StageQueueItem>(`SELECT * FROM stage_queue WHERE synced = 0 ORDER BY created_at ASC`);
}

export async function markStageSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE stage_queue SET synced = 1, error = NULL WHERE id = ?`, [id]);
}

export async function markStageError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE stage_queue SET error = ? WHERE id = ?`, [error, id]);
}

// ─── Tyre listings cache + write queue ───────────────────────────────────────

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
  updated_at: string;
};

export type TyreListingQueueItem = {
  id: string;
  op: string; // "create" | "update" | "delete"
  listing_id: string;
  payload: string; // JSON blob
  synced: number; // 0 or 1
  error: string | null;
  created_at: string;
};

export async function upsertTyreListing(t: TyreListing): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tyre_listings (id, server_id, width, height, diameter, brand, model, condition, price_ghs, photos, in_stock, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       server_id = excluded.server_id,
       width = excluded.width,
       height = excluded.height,
       diameter = excluded.diameter,
       brand = excluded.brand,
       model = excluded.model,
       condition = excluded.condition,
       price_ghs = excluded.price_ghs,
       photos = excluded.photos,
       in_stock = excluded.in_stock,
       updated_at = excluded.updated_at`,
    [t.id, t.server_id, t.width, t.height, t.diameter, t.brand, t.model, t.condition, t.price_ghs, t.photos, t.in_stock, t.updated_at],
  );
}

export async function getTyreListings(): Promise<TyreListing[]> {
  const db = await getDb();
  return db.getAllAsync<TyreListing>(`SELECT * FROM tyre_listings ORDER BY updated_at DESC`);
}

export async function deleteTyreListing(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tyre_listings WHERE id = ?`, [id]);
}

// Remove any stale rows that point at the same server listing but are keyed by
// a different (e.g. temporary "local-…") id. Guards against duplicates left by
// older builds where the create flush didn't re-key the local row.
export async function deleteDuplicateTyreListings(serverId: string, keepId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM tyre_listings WHERE server_id = ? AND id != ?`,
    [serverId, keepId],
  );
}

export async function enqueueTyreListing(q: TyreListingQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tyre_listing_queue (id, op, listing_id, payload, synced, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [q.id, q.op, q.listing_id, q.payload, q.synced, q.error, q.created_at],
  );
}

export async function getPendingTyreListings(): Promise<TyreListingQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<TyreListingQueueItem>(
    `SELECT * FROM tyre_listing_queue WHERE synced = 0 ORDER BY created_at ASC`,
  );
}

export async function markTyreListingSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tyre_listing_queue SET synced = 1, error = NULL WHERE id = ?`, [id]);
}

export async function markTyreListingError(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tyre_listing_queue SET error = ? WHERE id = ?`, [error, id]);
}
