import { api, tyreListingsApi } from "./api";
import {
  upsertAssignment,
  getAssignments,
  getPendingQuotes,
  markQuoteSynced,
  markQuoteError,
  getPendingDeclines,
  markDeclineSynced,
  markDeclineError,
  deleteAssignment,
  upsertOrder,
  getPendingStages,
  markStageSynced,
  markStageError,
  applyLocalStage,
  upsertTyreListing,
  getPendingTyreListings,
  markTyreListingSynced,
  markTyreListingError,
  deleteTyreListing,
  type Assignment,
} from "./db";
import { uploadImage } from "./upload";

type ApiAssignment = {
  id: string;
  requestId: string;
  status: string;
  notifiedAt: string | null;
  updatedAt: string;
  request: { status?: string; [key: string]: unknown };
  quote: object | null;
};

type ApiOrder = {
  id: string;
  fulfillmentStage: string;
  handedOverAt: string | null;
  handoverPhotos: string[];
  request: unknown;
  wonItems: { partName: string; condition: string; earnGhs: number }[];
  totalEarnGhs: number;
};

function mapRow(a: ApiAssignment): Assignment {
  return {
    id: a.id,
    request_id: a.requestId,
    status: a.status,
    notified_at: a.notifiedAt ?? null,
    updated_at: a.updatedAt,
    request_data: JSON.stringify(a.request),
    quote_data: a.quote ? JSON.stringify(a.quote) : null,
    fee_paid: a.request.status !== "AWAITING_PAYMENT" ? 1 : 0,
  };
}

export async function pullAssignments(): Promise<void> {
  console.log("[sync] pullAssignments: fetching /vendor/requests");
  let assignments: ApiAssignment[];
  try {
    const res = await api.get<{ assignments: ApiAssignment[] }>("/vendor/requests");
    console.log("[sync] raw response keys:", Object.keys(res ?? {}));
    assignments = res.assignments;
  } catch (err) {
    console.error("[sync] pullAssignments FAILED:", err);
    throw err;
  }
  console.log(`[sync] server returned ${assignments.length} assignments:`, assignments.map((a) => `${a.id.slice(-6)} ${a.status}`));

  const returnedIds = new Set<string>();
  for (const a of assignments) {
    returnedIds.add(a.id);
    await upsertAssignment(mapRow(a));
  }

  // Locally-PENDING assignments absent from the server list were actioned on
  // another device. Fetch each individually to get their current status.
  const localPending = await getAssignments("PENDING");
  console.log(`[sync] local PENDING count: ${localPending.length}`, localPending.map((r) => r.id.slice(-6)));
  const stale = localPending.filter((r) => !returnedIds.has(r.id));
  console.log(`[sync] stale (missing from server list): ${stale.length}`, stale.map((r) => r.id.slice(-6)));

  await Promise.allSettled(
    stale.map(async (r) => {
      try {
        console.log(`[sync] fetching individual status for ${r.id.slice(-6)}`);
        const { assignment: live } = await api.get<{ assignment: ApiAssignment }>(
          `/vendor/requests/${r.id}`,
        );
        console.log(`[sync] individual fetch result for ${r.id.slice(-6)}: status=${live?.status}`);
        if (live) await upsertAssignment(mapRow(live));
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 404) {
          // The assignment no longer exists on the server (request deleted or
          // expired). Drop it locally so we stop re-fetching it every sync.
          console.log(`[sync] pruning gone assignment ${r.id.slice(-6)} (404)`);
          await deleteAssignment(r.id);
        } else {
          console.warn(`[sync] individual fetch failed for ${r.id.slice(-6)}:`, err);
        }
      }
    }),
  );

  console.log("[sync] pullAssignments done");
}

export async function pushPendingQuotes(): Promise<void> {
  const queue = await getPendingQuotes();
  console.log(`[sync] pushPendingQuotes: ${queue.length} queued`, queue.map((q) => `${q.assignment_id.slice(-6)} err=${q.error ?? "none"}`));

  for (const item of queue) {
    try {
      const payload: unknown = JSON.parse(item.payload);
      console.log(`[sync] posting quote for ${item.assignment_id.slice(-6)}, payload keys:`, Object.keys(payload as object));
      await api.post(`/vendor/requests/${item.assignment_id}/quote`, payload);
      await markQuoteSynced(item.id);
      console.log(`[sync] quote synced for ${item.assignment_id.slice(-6)}`);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error(`[sync] quote push FAILED for ${item.assignment_id.slice(-6)}: ${e.status} ${e.message}`);
      if (e.status === 409 || e.status === 404) {
        // 409 = already quoted or expired; 404 = assignment no longer exists. Stop retrying.
        await markQuoteSynced(item.id);
        await markQuoteError(item.id, e.status === 404 ? "not found" : "expired");
      } else {
        await markQuoteError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function pushPendingDeclines(): Promise<void> {
  const queue = await getPendingDeclines();
  console.log(`[sync] pushPendingDeclines: ${queue.length} queued`, queue.map((q) => `${q.assignment_id.slice(-6)} err=${q.error ?? "none"}`));

  for (const item of queue) {
    try {
      console.log(`[sync] posting decline for ${item.assignment_id.slice(-6)}`);
      await api.post(`/vendor/requests/${item.assignment_id}/decline`, {});
      await markDeclineSynced(item.id);
      console.log(`[sync] decline synced for ${item.assignment_id.slice(-6)}`);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error(`[sync] decline push FAILED for ${item.assignment_id.slice(-6)}: ${e.status} ${e.message}`);
      if (e.status === 404 || e.status === 409) {
        await markDeclineSynced(item.id);
      } else {
        await markDeclineError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function pushPendingStages(): Promise<void> {
  const queue = await getPendingStages();
  console.log(`[sync] pushPendingStages: ${queue.length} queued`, queue.map((q) => `${q.order_id.slice(-6)} err=${q.error ?? "none"}`));

  for (const item of queue) {
    // FIX 3: guard against malformed queue rows that would otherwise retry forever.
    let photos: string[];
    let location: { latitude: number; longitude: number } | undefined;
    try {
      photos = JSON.parse(item.photos) as string[];
      location = item.location ? (JSON.parse(item.location) as { latitude: number; longitude: number }) : undefined;
    } catch (parseErr) {
      console.error(`[sync] bad payload for stage item ${item.id} — dropping`, parseErr);
      await markStageSynced(item.id);
      await markStageError(item.id, "bad payload");
      continue;
    }

    try {
      // FIX 1: upload any local-file URIs before POSTing the stage.
      // Values that already start with "http" are already uploaded CDN URLs and
      // pass through unchanged.  Values that don't start with "http" are local
      // file:// / content:// URIs captured offline and need to be uploaded now.
      const uploadedPhotos: string[] = [];
      for (const uri of photos) {
        if (uri.startsWith("http")) {
          uploadedPhotos.push(uri);
        } else {
          console.log(`[sync] uploading local photo for ${item.order_id.slice(-6)}`);
          const remoteUrl = await uploadImage(uri);
          uploadedPhotos.push(remoteUrl);
        }
      }

      console.log(`[sync] posting stage for ${item.order_id.slice(-6)}`);
      await api.post(`/vendor/orders/${item.order_id}/stage`, {
        stage: item.stage,
        ...(uploadedPhotos.length ? { photos: uploadedPhotos } : {}),
        ...(location ? { location } : {}),
      });
      await markStageSynced(item.id);
      console.log(`[sync] stage synced for ${item.order_id.slice(-6)}`);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error(`[sync] stage push FAILED for ${item.order_id.slice(-6)}: ${e.status} ${e.message}`);
      if (e.status === 404 || e.status === 409) {
        // 404 = gone; 409 = backward/not-won — stop retrying.
        await markStageSynced(item.id);
        await markStageError(item.id, e.status === 404 ? "not found" : "conflict");
      } else {
        // Upload failure (still offline) or transient error — leave synced=0 for retry.
        await markStageError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function pullOrders(): Promise<void> {
  console.log("[sync] pullOrders: fetching /vendor/orders");
  let orders: ApiOrder[];
  try {
    const res = await api.get<{ orders: ApiOrder[] }>("/vendor/orders");
    orders = res.orders;
  } catch (err) {
    console.warn("[sync] pullOrders failed:", err);
    return;
  }
  console.log(`[sync] server returned ${orders.length} orders`, orders.map((o) => `${o.id.slice(-6)} ${o.fulfillmentStage}`));

  for (const o of orders) {
    await upsertOrder({
      id: o.id,
      stage: o.fulfillmentStage,
      won_items: JSON.stringify(o.wonItems),
      total_earn_ghs: o.totalEarnGhs,
      request_data: JSON.stringify(o.request),
      handed_over_at: o.handedOverAt,
      handover_photos: JSON.stringify(o.handoverPhotos),
      updated_at: new Date().toISOString(),
    });
  }

  // FIX 2: re-apply any pending optimistic stage transitions so a server pull
  // doesn't clobber a locally-queued forward transition that hasn't flushed yet.
  const pendingStages = await getPendingStages();
  for (const pending of pendingStages) {
    await applyLocalStage(pending.order_id, pending.stage);
  }

  console.log("[sync] pullOrders done");
}

export async function pushPendingTyreListings(): Promise<void> {
  const queue = await getPendingTyreListings();
  console.log(`[sync] pushPendingTyreListings: ${queue.length} queued`, queue.map((q) => `${q.listing_id.slice(-6)} op=${q.op} err=${q.error ?? "none"}`));

  for (const item of queue) {
    // Guard against malformed queue rows that would otherwise retry forever.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(item.payload) as Record<string, unknown>;
    } catch (parseErr) {
      console.error(`[sync] bad payload for tyre listing queue item ${item.id} — dropping`, parseErr);
      await markTyreListingSynced(item.id);
      await markTyreListingError(item.id, "bad payload");
      continue;
    }

    try {
      if (item.op === "create") {
        // Upload any local photo URIs before POSTing — mirrors pushPendingStages photo upload-at-flush.
        const rawPhotos = Array.isArray(payload.photos) ? (payload.photos as string[]) : [];
        const uploadedPhotos: string[] = [];
        for (const uri of rawPhotos) {
          if (uri.startsWith("http")) {
            uploadedPhotos.push(uri);
          } else {
            console.log(`[sync] uploading local tyre photo for listing ${item.listing_id.slice(-6)}`);
            const remoteUrl = await uploadImage(uri);
            uploadedPhotos.push(remoteUrl);
          }
        }
        const body = { ...payload, ...(uploadedPhotos.length ? { photos: uploadedPhotos } : {}) };
        console.log(`[sync] creating tyre listing for ${item.listing_id.slice(-6)}`);
        const { listing } = await tyreListingsApi.create(body);
        // Update local record with the server-assigned id.
        await upsertTyreListing({
          id: item.listing_id,
          server_id: listing.id,
          width: listing.width,
          height: listing.height,
          diameter: listing.diameter,
          brand: listing.brand,
          model: listing.model,
          condition: listing.condition,
          price_ghs: listing.priceGhs,
          photos: JSON.stringify(listing.photos),
          in_stock: listing.inStock ? 1 : 0,
          updated_at: listing.updatedAt,
        });
        await markTyreListingSynced(item.id);
        console.log(`[sync] tyre listing created for ${item.listing_id.slice(-6)}, server_id=${listing.id.slice(-6)}`);
      } else if (item.op === "update") {
        // Upload any local photo URIs before PATCHing.
        const rawPhotos = Array.isArray(payload.photos) ? (payload.photos as string[]) : [];
        const uploadedPhotos: string[] = [];
        for (const uri of rawPhotos) {
          if (uri.startsWith("http")) {
            uploadedPhotos.push(uri);
          } else {
            console.log(`[sync] uploading local tyre photo for listing ${item.listing_id.slice(-6)}`);
            const remoteUrl = await uploadImage(uri);
            uploadedPhotos.push(remoteUrl);
          }
        }
        const serverId = typeof payload.server_id === "string" ? payload.server_id : item.listing_id;
        const body = { ...payload, ...(rawPhotos.length ? { photos: uploadedPhotos } : {}) };
        console.log(`[sync] updating tyre listing ${serverId.slice(-6)}`);
        await tyreListingsApi.update(serverId, body);
        await markTyreListingSynced(item.id);
        console.log(`[sync] tyre listing updated for ${item.listing_id.slice(-6)}`);
      } else if (item.op === "delete") {
        const serverId = typeof payload.server_id === "string" ? payload.server_id : item.listing_id;
        console.log(`[sync] deleting tyre listing ${serverId.slice(-6)}`);
        await tyreListingsApi.delete(serverId);
        await deleteTyreListing(item.listing_id);
        await markTyreListingSynced(item.id);
        console.log(`[sync] tyre listing deleted for ${item.listing_id.slice(-6)}`);
      } else {
        // Unknown op — drop it.
        console.warn(`[sync] unknown tyre listing op "${item.op}" for item ${item.id} — dropping`);
        await markTyreListingSynced(item.id);
        await markTyreListingError(item.id, `unknown op: ${item.op}`);
      }
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error(`[sync] tyre listing push FAILED for ${item.listing_id.slice(-6)}: ${e.status} ${e.message}`);
      if (e.status === 404 || e.status === 409) {
        // 404 = gone; 409 = conflict — stop retrying.
        await markTyreListingSynced(item.id);
        await markTyreListingError(item.id, e.status === 404 ? "not found" : "conflict");
      } else {
        // Upload failure (still offline) or transient error — leave synced=0 for retry.
        await markTyreListingError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function pullTyreListings(): Promise<void> {
  console.log("[sync] pullTyreListings: fetching /vendor/tyre-listings");
  let listings: import("./api").ApiTyreListing[];
  try {
    const res = await tyreListingsApi.getAll();
    listings = res.listings;
  } catch (err) {
    console.warn("[sync] pullTyreListings failed:", err);
    return;
  }
  console.log(`[sync] server returned ${listings.length} tyre listings`);

  for (const l of listings) {
    await upsertTyreListing({
      id: l.id,
      server_id: l.id,
      width: l.width,
      height: l.height,
      diameter: l.diameter,
      brand: l.brand,
      model: l.model,
      condition: l.condition,
      price_ghs: l.priceGhs,
      photos: JSON.stringify(l.photos),
      in_stock: l.inStock ? 1 : 0,
      updated_at: l.updatedAt,
    });
  }

  console.log("[sync] pullTyreListings done");
}

export async function sync(): Promise<void> {
  console.log("[sync] ---- sync started ---- API:", process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000");
  await pullAssignments();
  await pushPendingQuotes();
  await pushPendingDeclines();
  await pushPendingStages();
  await pullOrders();
  await pushPendingTyreListings();
  await pullTyreListings();
  console.log("[sync] ---- sync complete ----");
}
