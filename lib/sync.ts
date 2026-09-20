import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import {
  upsertAssignment,
  getPendingQuotes,
  markQuoteSynced,
  markQuoteError,
  getPendingDeclines,
  markDeclineSynced,
  markDeclineError,
  type Assignment,
} from "./db";

const LAST_SYNC_KEY = "last_sync_at";

type ApiAssignment = {
  id: string;
  request_id: string;
  status: string;
  notified_at: string | null;
  updated_at: string;
  request: object;
  quote: object | null;
};

export async function pullAssignments(): Promise<void> {
  const lastSync = await SecureStore.getItemAsync(LAST_SYNC_KEY);
  const path = lastSync
    ? `/vendor/requests?updatedSince=${encodeURIComponent(lastSync)}`
    : "/vendor/requests";

  const { assignments } = await api.get<{ assignments: ApiAssignment[] }>(path);

  for (const a of assignments) {
    const row: Assignment = {
      id: a.id,
      request_id: a.request_id,
      status: a.status,
      notified_at: a.notified_at,
      updated_at: a.updated_at,
      request_data: JSON.stringify(a.request),
      quote_data: a.quote ? JSON.stringify(a.quote) : null,
    };
    await upsertAssignment(row);
  }

  await SecureStore.setItemAsync(LAST_SYNC_KEY, new Date().toISOString());
}

export async function pushPendingQuotes(): Promise<void> {
  const queue = await getPendingQuotes();

  for (const item of queue) {
    try {
      const payload: unknown = JSON.parse(item.payload);
      await api.post(`/vendor/requests/${item.assignment_id}/quote`, payload);
      await markQuoteSynced(item.id);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 409) {
        // Assignment expired — mark synced to stop retrying, record error for UI
        await markQuoteSynced(item.id);
        await markQuoteError(item.id, "expired");
      } else {
        await markQuoteError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function pushPendingDeclines(): Promise<void> {
  const queue = await getPendingDeclines();
  for (const item of queue) {
    try {
      await api.post(`/vendor/requests/${item.assignment_id}/decline`, {});
      await markDeclineSynced(item.id);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404 || e.status === 409) {
        await markDeclineSynced(item.id);
      } else {
        await markDeclineError(item.id, e.message ?? "unknown error");
      }
    }
  }
}

export async function sync(): Promise<void> {
  await pullAssignments();
  await pushPendingQuotes();
  await pushPendingDeclines();
}
