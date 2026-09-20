import * as SQLite from "expo-sqlite";

export type Assignment = {
  id: string;
  request_id: string;
  status: string;
  notified_at: string | null;
  updated_at: string;
  request_data: string; // JSON blob
  quote_data: string | null; // JSON blob
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

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!_db) _db = await SQLite.openDatabaseAsync("vendor.db");
  return _db;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL,
      notified_at TEXT,
      updated_at TEXT NOT NULL,
      request_data TEXT NOT NULL,
      quote_data TEXT
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
  `);
}

export async function upsertAssignment(a: Assignment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO assignments (id, request_id, status, notified_at, updated_at, request_data, quote_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       notified_at = excluded.notified_at,
       updated_at = excluded.updated_at,
       request_data = excluded.request_data,
       quote_data = excluded.quote_data`,
    [a.id, a.request_id, a.status, a.notified_at, a.updated_at, a.request_data, a.quote_data],
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
