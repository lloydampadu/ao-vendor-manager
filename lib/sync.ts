import { api } from "./api";
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
  type Assignment,
} from "./db";

type ApiAssignment = {
  id: string;
  requestId: string;
  status: string;
  notifiedAt: string | null;
  updatedAt: string;
  request: { status?: string; [key: string]: unknown };
  quote: object | null;
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

export async function sync(): Promise<void> {
  console.log("[sync] ---- sync started ---- API:", process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000");
  await pullAssignments();
  await pushPendingQuotes();
  await pushPendingDeclines();
  console.log("[sync] ---- sync complete ----");
}
