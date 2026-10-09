import {
  api,
  batteryCatalogApi,
  batteryListingsApi,
  fluidCatalogApi,
  fluidListingsApi,
  lightListingsApi,
  tyreCatalogApi,
  tyreListingsApi,
  type ApiBatteryListing,
  type ApiFluidListing,
  type ApiLightListing,
  type ApiTyreListing,
} from "./api";
import { ApiError, failureAction, isApiError } from "./api-error";
import { getToken } from "./auth";
import {
  applyLocalStage,
  cacheBatteryCatalog,
  cacheFluidCatalog,
  cacheTyreCatalog,
  deleteAssignment,
  deleteDuplicateListings,
  deleteListing,
  enqueueListingOp,
  getAssignment,
  getAssignmentIdsWithPendingActions,
  getAssignments,
  getListingIdsWithPendingOps,
  getPendingDeclines,
  getPendingListingOps,
  markFluidRejected,
  markListingRejected,
  getPendingQuotes,
  getPendingStages,
  markDeclineError,
  markDeclineSynced,
  markListingOpError,
  markListingOpSynced,
  markQuoteError,
  markQuoteSynced,
  markStageError,
  markStageSynced,
  pruneAssignments,
  pruneListings,
  pruneOrders,
  upsertAssignment,
  upsertAssignments,
  upsertBatteryListing,
  upsertFluidListing,
  upsertLightListing,
  upsertOrders,
  upsertTyreListing,
  type Assignment,
  type BatteryListing,
  type FluidListing,
  type LightListing,
  type ListingKind,
  type ListingQueueItem,
  type TyreListing,
} from "./db";
import { createLogger } from "./logger";
import { mapAssignment, mapBattery, mapFluid, mapLight, mapOrder, mapTyre, mergeAssignment, type ApiAssignment, type ApiOrder } from "./mappers";
import { uploadLocalPhotos } from "./upload";

const log = createLogger("sync");

function describe(err: unknown): string {
  if (isApiError(err)) return err.message;
  return err instanceof Error ? err.message : "unknown error";
}

// ─── Pulls ───────────────────────────────────────────────────────────────────
//
// Each pull is split into a network fetch and a database apply. Fetches run in
// parallel; applies run one after another because expo-sqlite shares a single
// connection and nested/concurrent transactions are not allowed.

type AssignmentsSnapshot = { assignments: ApiAssignment[] };

export async function fetchAssignments(): Promise<AssignmentsSnapshot> {
  return api.get<{ assignments: ApiAssignment[] }>("/vendor/requests");
}

/**
 * Applies a pulled assignment list. Rows with a queued quote/decline that
 * hasn't reached the server keep their optimistic local status so the UI never
 * flips a request back to "New" (and invites a duplicate quote) mid-push.
 */
export async function applyAssignments({ assignments }: AssignmentsSnapshot): Promise<void> {
  const pending = await getAssignmentIdsWithPendingActions();

  const rows: Assignment[] = [];
  for (const a of assignments) {
    const server = mapAssignment(a);
    const local = pending.has(a.id) ? await getAssignment(a.id) : null;
    rows.push(mergeAssignment(server, local, pending.has(a.id)));
  }
  await upsertAssignments(rows);

  // Locally-pending assignments absent from the server list were actioned on
  // another device or expired. Fetch each individually; 404 means gone.
  const returned = new Set(assignments.map((a) => a.id));
  const stale = (await getAssignments(["PENDING"])).filter((r) => !returned.has(r.id));
  for (const r of stale) await refreshAssignment(r.id).catch(() => {});

  // The list endpoint returns every assignment for this vendor, so anything
  // else still on disk was deleted server-side. Keep rows with queued actions.
  await pruneAssignments(new Set([...returned, ...pending]));
  log.debug("applyAssignments", { count: assignments.length, stale: stale.length });
}

export async function pullAssignments(): Promise<void> {
  await applyAssignments(await fetchAssignments());
}

/** Fetches one assignment and stores the server truth. Returns null when it no longer exists. */
export async function refreshAssignment(id: string): Promise<Assignment | null> {
  try {
    const { assignment } = await api.get<{ assignment: ApiAssignment }>(`/vendor/requests/${id}`);
    const pending = (await getAssignmentIdsWithPendingActions()).has(id);
    const local = pending ? await getAssignment(id) : null;
    const row = mergeAssignment(mapAssignment(assignment), local, pending);
    await upsertAssignment(row);
    return row;
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      await deleteAssignment(id);
      return null;
    }
    throw err;
  }
}

type OrdersSnapshot = { orders: ApiOrder[] };

export const fetchOrders = (): Promise<OrdersSnapshot> => api.get<{ orders: ApiOrder[] }>("/vendor/orders");

export async function applyOrders({ orders }: OrdersSnapshot): Promise<void> {
  const now = new Date().toISOString();
  await upsertOrders(orders.map((o) => mapOrder(o, now)));

  const pendingStages = await getPendingStages();
  await pruneOrders(new Set([...orders.map((o) => o.id), ...pendingStages.map((s) => s.order_id)]));

  // Re-apply queued forward transitions so a pull can't rewind a stage the
  // vendor already advanced while offline.
  for (const pending of pendingStages) {
    await applyLocalStage(pending.order_id, pending.stage);
  }
  log.debug("applyOrders", { count: orders.length });
}

export async function pullOrders(): Promise<void> {
  await applyOrders(await fetchOrders());
}

export const applyTyreListings = ({ listings }: { listings: ApiTyreListing[] }) => applyListings(TYRE_FLUSH, listings);

export async function pullTyreListings(): Promise<void> {
  await applyTyreListings(await tyreListingsApi.getAll());
}

export const applyLightListings = ({ listings }: { listings: ApiLightListing[] }) => applyListings(LIGHT_FLUSH, listings);

export async function pullLightListings(): Promise<void> {
  await applyLightListings(await lightListingsApi.getAll());
}

export const applyFluidListings = ({ listings }: { listings: ApiFluidListing[] }) => applyListings(FLUID_FLUSH, listings);

export const applyBatteryListings = ({ listings }: { listings: ApiBatteryListing[] }) => applyListings(BATTERY_FLUSH, listings);

export async function pullTyreCatalog(): Promise<void> {
  const { brands } = await tyreCatalogApi.get();
  await cacheTyreCatalog(brands);
}

// ─── Pushes ──────────────────────────────────────────────────────────────────

type QuotePayloadShape = {
  photos?: string[];
  photosByCondition?: Record<string, string[]>;
  [key: string]: unknown;
};

export async function pushPendingQuotes(): Promise<void> {
  for (const item of await getPendingQuotes()) {
    try {
      const payload = JSON.parse(item.payload) as QuotePayloadShape;
      // Photos may still be local file URIs if the vendor quoted offline.
      // Upload each distinct URI once; the flat list and the per-condition map
      // reference the same files.
      const uploaded = new Map<string, string>();
      const resolve = async (uris: string[]) => {
        const out: string[] = [];
        for (const uri of uris) {
          if (!uploaded.has(uri)) uploaded.set(uri, (await uploadLocalPhotos([uri]))[0]);
          out.push(uploaded.get(uri)!);
        }
        return out;
      };
      const byCondition: Record<string, string[]> = {};
      for (const [cond, uris] of Object.entries(payload.photosByCondition ?? {})) byCondition[cond] = await resolve(uris);
      const flat = await resolve(payload.photos ?? []);
      await api.post(`/vendor/requests/${item.assignment_id}/quote`, { ...payload, photos: flat, photosByCondition: byCondition });
      await markQuoteSynced(item.id);
    } catch (err) {
      if (failureAction(err) === "drop") {
        // 409 = already quoted / expired, 404 = assignment gone. Pull the truth.
        await markQuoteSynced(item.id, describe(err));
        await refreshAssignment(item.assignment_id).catch(() => {});
      } else {
        await markQuoteError(item.id, describe(err));
        throw err; // offline — stop flushing, the rest will fail the same way
      }
    }
  }
}

export async function pushPendingDeclines(): Promise<void> {
  for (const item of await getPendingDeclines()) {
    try {
      await api.post(`/vendor/requests/${item.assignment_id}/decline`, {});
      await markDeclineSynced(item.id);
    } catch (err) {
      if (failureAction(err) === "drop") {
        await markDeclineSynced(item.id, describe(err));
        await refreshAssignment(item.assignment_id).catch(() => {});
      } else {
        await markDeclineError(item.id, describe(err));
        throw err;
      }
    }
  }
}

export async function pushPendingStages(): Promise<void> {
  for (const item of await getPendingStages()) {
    try {
      const photos = JSON.parse(item.photos) as string[];
      const location = item.location ? (JSON.parse(item.location) as { latitude: number; longitude: number }) : undefined;
      const uploaded = await uploadLocalPhotos(photos);
      await api.post(`/vendor/orders/${item.order_id}/stage`, {
        stage: item.stage,
        ...(uploaded.length ? { photos: uploaded } : {}),
        ...(location ? { location } : {}),
      });
      await markStageSynced(item.id);
    } catch (err) {
      if (failureAction(err) === "drop") {
        await markStageSynced(item.id, describe(err));
      } else {
        await markStageError(item.id, describe(err));
        throw err;
      }
    }
  }
}

// ─── Listing queues (one flusher and one apply step for every listing kind) ───

/**
 * Applies the listings the server returned for one kind. Rows with a local edit in flight are left
 * alone (and never pruned); the rest are written and de-duplicated; then rows the server no longer
 * returns are pruned. REJECTED rows have no server copy, so pruneListings keeps them.
 */
async function applyListings<TRow, TApi>(cfg: ListingFlushConfig<TRow, TApi>, listings: TApi[]): Promise<void> {
  const pending = await getListingIdsWithPendingOps(cfg.kind);
  for (const l of listings) {
    const id = cfg.idOf(l);
    if (pending.has(id)) continue; // local edit still in flight — don't clobber it
    await cfg.upsert(cfg.toRow(l));
    await deleteDuplicateListings(cfg.kind, id, id);
  }
  await pruneListings(cfg.kind, new Set(listings.map(cfg.idOf)), pending);
  log.debug("applyListings", { kind: cfg.kind, count: listings.length });
}

type ListingFlushConfig<TRow, TApi> = {
  kind: ListingKind;
  create: (body: unknown) => Promise<{ listing: TApi }>;
  update: (id: string, body: unknown) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  toRow: (l: TApi) => TRow;
  upsert: (row: TRow) => Promise<void>;
  idOf: (l: TApi) => string;
  /** The server's id for a listing this vendor already has, when a create was refused as a duplicate. */
  existingIdOf?: (err: unknown) => string | null;
  /** A create the server refused for good: keep the local row, marked with the reason. */
  rejectCreate?: (localId: string, reason: string) => Promise<void>;
  /** Extra typed fields to carry onto the adopted listing (beyond price, photos and stock). */
  adoptFields?: string[];
};

const TYRE_FLUSH: ListingFlushConfig<TyreListing, ApiTyreListing> = {
  kind: "tyre",
  create: tyreListingsApi.create,
  update: tyreListingsApi.update,
  remove: tyreListingsApi.delete,
  toRow: mapTyre,
  upsert: upsertTyreListing,
  idOf: (l) => l.id,
};

const LIGHT_FLUSH: ListingFlushConfig<LightListing, ApiLightListing> = {
  kind: "light",
  create: lightListingsApi.create,
  update: lightListingsApi.update,
  remove: lightListingsApi.delete,
  toRow: mapLight,
  upsert: upsertLightListing,
  idOf: (l) => l.id,
};

/** The 409 ALREADY_LISTED body carries the id of the listing the vendor already has. */
function alreadyListedId(err: unknown): string | null {
  const body = isApiError(err) && err.status === 409 ? (err.body as { code?: unknown; listingId?: unknown } | undefined) : undefined;
  return body?.code === "ALREADY_LISTED" && typeof body.listingId === "string" ? body.listingId : null;
}

const FLUID_FLUSH: ListingFlushConfig<FluidListing, ApiFluidListing> = {
  kind: "fluid",
  create: fluidListingsApi.create,
  update: fluidListingsApi.update,
  remove: fluidListingsApi.delete,
  toRow: mapFluid,
  upsert: upsertFluidListing,
  rejectCreate: markFluidRejected,
  idOf: (l) => l.id,
  existingIdOf: alreadyListedId,
};

// Lazy wrappers: the API object is resolved at call time, so a test's partial mock of ../lib/api still loads.
const BATTERY_FLUSH: ListingFlushConfig<BatteryListing, ApiBatteryListing> = {
  kind: "battery",
  create: (b) => batteryListingsApi.create(b),
  update: (id, b) => batteryListingsApi.update(id, b),
  remove: (id) => batteryListingsApi.delete(id),
  toRow: mapBattery,
  upsert: upsertBatteryListing,
  rejectCreate: (id, reason) => markListingRejected("battery", id, reason),
  idOf: (l) => l.id,
  existingIdOf: alreadyListedId,
  adoptFields: ["warrantyMonths"],
};

async function flushListingItem<TRow, TApi>(cfg: ListingFlushConfig<TRow, TApi>, item: ListingQueueItem): Promise<void> {
  const payload = JSON.parse(item.payload) as Record<string, unknown> & { server_id?: string | null; photos?: string[] };
  const { server_id, ...body } = payload;

  if (item.op === "delete") {
    if (server_id) await cfg.remove(server_id);
    // No server_id → the listing never synced; deleting locally is enough.
    await deleteListing(cfg.kind, item.listing_id);
    return;
  }

  // Photos are uploaded and sent only when the op carries them (a stock toggle sends inStock alone).
  const hasPhotos = Array.isArray(body.photos);
  const photos = hasPhotos ? await uploadLocalPhotos(body.photos as string[]) : [];
  const serverBody = hasPhotos ? { ...body, photos } : body;

  if (item.op === "create") {
    let listing: TApi;
    try {
      ({ listing } = await cfg.create(serverBody));
    } catch (err) {
      // Already listed (another phone, or a create whose reply was lost): adopt the existing
      // listing. Dropping the local row lets the pull that follows bring in the server's copy,
      // and edits queued behind this create now target it.
      const existing = cfg.existingIdOf?.(err);
      if (!existing) throw err;
      await deleteListing(cfg.kind, item.listing_id);
      await rekeyQueuedOps(cfg.kind, item.id, item.listing_id, existing);
      // Keep what the vendor just entered: price, photos and stock go onto the existing listing
      // (never the product). Queued ahead of any edits that were waiting behind this create.
      await enqueueListingOp(cfg.kind, {
        id: `${item.id}-existing`, op: "update", listing_id: existing, synced: 0, error: null, created_at: item.created_at,
        payload: JSON.stringify({ server_id: existing, priceGhs: body.priceGhs, photos, inStock: body.inStock,
          ...Object.fromEntries((cfg.adoptFields ?? []).map((f) => [f, body[f]])) }),
      });
      return;
    }
    const serverId = cfg.idOf(listing);
    // Re-key the local row from the temporary local id to the server id so the
    // next pull (keyed by server id) doesn't create a duplicate.
    if (item.listing_id !== serverId) await deleteListing(cfg.kind, item.listing_id);
    await cfg.upsert(cfg.toRow(listing));
    // Later queue items for this listing were enqueued with the local id and a
    // null server_id; rewrite them so they target the real listing.
    await rekeyQueuedOps(cfg.kind, item.id, item.listing_id, serverId);
    return;
  }

  if (item.op === "update") {
    const target = typeof server_id === "string" && server_id ? server_id : item.listing_id;
    await cfg.update(target, serverBody);
    return;
  }

  throw new ApiError(`unknown op "${item.op}"`, 400);
}

async function rekeyQueuedOps(kind: ListingKind, currentItemId: string, localId: string, serverId: string): Promise<void> {
  // The create being flushed is still unsynced at this point — never rekey it,
  // or it would be re-created on every pass.
  const later = (await getPendingListingOps(kind)).filter((q) => q.listing_id === localId && q.id !== currentItemId);
  for (const q of later) {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(q.payload) as Record<string, unknown>; } catch { /* keep empty */ }
    await markListingOpSynced(kind, q.id, "rekeyed");
    await enqueueListingOp(kind, {
      ...q,
      id: `${q.id}-rk`,
      listing_id: serverId,
      payload: JSON.stringify({ ...payload, server_id: serverId }),
    });
  }
}

async function pushListingQueue<TRow, TApi>(cfg: ListingFlushConfig<TRow, TApi>): Promise<void> {
  // Re-read the queue after every item: a create can rekey the items behind it.
  const attempted = new Set<string>();
  for (;;) {
    const item = (await getPendingListingOps(cfg.kind)).find((q) => !attempted.has(q.id));
    if (!item) break;
    attempted.add(item.id);
    try {
      await flushListingItem(cfg, item);
      await markListingOpSynced(cfg.kind, item.id);
    } catch (err) {
      if (failureAction(err) === "drop") {
        await markListingOpSynced(cfg.kind, item.id, describe(err));
        if (item.op === "create") await cfg.rejectCreate?.(item.listing_id, describe(err));
      } else {
        await markListingOpError(cfg.kind, item.id, describe(err));
        throw err;
      }
    }
  }
}

export const pushPendingTyreListings = () => pushListingQueue(TYRE_FLUSH);
export const pushPendingLightListings = () => pushListingQueue(LIGHT_FLUSH);
export const pushPendingFluidListings = () => pushListingQueue(FLUID_FLUSH);
export const pushPendingBatteryListings = () => pushListingQueue(BATTERY_FLUSH);

// ─── Orchestration ───────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean;
  /** First error encountered, if any. Network errors mean "offline". */
  error?: unknown;
};

/**
 * One full sync pass.
 *
 * Order matters: local writes go first so a vendor's quote lands even if a
 * later pull fails, then pulls run concurrently. Each phase is isolated — one
 * failing queue never blocks the others. The assignments pull is the only one
 * that fails the whole pass, because the inbox is the app's core screen.
 */
export async function sync(): Promise<SyncResult> {
  if (!(await getToken())) return { ok: false, error: new ApiError("Not signed in", 401) };

  let firstError: unknown;
  const note = (phase: string) => (err: unknown) => {
    firstError ??= err;
    log.warn(`${phase} failed`, err);
  };

  await pushPendingQuotes().catch(note("pushQuotes"));
  await pushPendingDeclines().catch(note("pushDeclines"));
  await pushPendingStages().catch(note("pushStages"));
  await pushPendingTyreListings().catch(note("pushTyres"));
  await pushPendingLightListings().catch(note("pushLights"));
  await pushPendingFluidListings().catch(note("pushFluids"));
  await pushPendingBatteryListings().catch(note("pushBatteries"));

  // Network in parallel, database writes in sequence (single SQLite connection).
  const [assignments, orders, tyres, lights, catalog, fluids, fluidCatalog, batteries, batteryCatalog] = await Promise.allSettled([
    fetchAssignments(),
    fetchOrders(),
    tyreListingsApi.getAll(),
    lightListingsApi.getAll(),
    tyreCatalogApi.get(),
    fluidListingsApi.getAll(),
    fluidCatalogApi.get(),
    batteryListingsApi.getAll(),
    batteryCatalogApi.get(),
  ]);

  let assignmentsOk = true;
  if (assignments.status === "fulfilled") {
    await applyAssignments(assignments.value).catch((err) => { assignmentsOk = false; note("applyAssignments")(err); });
  } else {
    assignmentsOk = false;
    note("fetchAssignments")(assignments.reason);
  }
  if (orders.status === "fulfilled") await applyOrders(orders.value).catch(note("applyOrders")); else note("fetchOrders")(orders.reason);
  if (tyres.status === "fulfilled") await applyTyreListings(tyres.value).catch(note("applyTyres")); else note("fetchTyres")(tyres.reason);
  if (lights.status === "fulfilled") await applyLightListings(lights.value).catch(note("applyLights")); else note("fetchLights")(lights.reason);
  if (catalog.status === "fulfilled") await cacheTyreCatalog(catalog.value.brands).catch(note("cacheCatalog")); else note("fetchCatalog")(catalog.reason);
  if (fluids.status === "fulfilled") await applyFluidListings(fluids.value).catch(note("applyFluids")); else note("fetchFluids")(fluids.reason);
  if (fluidCatalog.status === "fulfilled") await cacheFluidCatalog(fluidCatalog.value).catch(note("cacheFluidCatalog")); else note("fetchFluidCatalog")(fluidCatalog.reason);
  if (batteries.status === "fulfilled") await applyBatteryListings(batteries.value).catch(note("applyBatteries")); else note("fetchBatteries")(batteries.reason);
  if (batteryCatalog.status === "fulfilled") await cacheBatteryCatalog(batteryCatalog.value).catch(note("cacheBatteryCatalog")); else note("fetchBatteryCatalog")(batteryCatalog.reason);

  if (!assignmentsOk) return { ok: false, error: firstError };
  return { ok: true, error: firstError };
}
