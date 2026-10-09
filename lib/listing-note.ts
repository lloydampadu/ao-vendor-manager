// What a vendor needs to know about a listing customers can't see yet. One wording for every family
// with dropdown picks and a price check (oils & fluids, batteries).
export type NotedListing = { status: string; review_status: string; hidden?: number; hidden_reason?: string | null; rejected_reason?: string | null };

export function listingNote(l: NotedListing): string | null {
  if (l.status === "REJECTED") return `Not saved: ${l.rejected_reason || "the server refused it"}`;
  if (l.hidden === 1) return l.hidden_reason ? `Hidden by AbosseyOkai Direct: ${l.hidden_reason}` : "Hidden by AbosseyOkai Direct.";
  if (l.review_status === "PRICE_CHECK") return "Price being checked by AbosseyOkai Direct. Customers can't see it yet.";
  if (l.status === "LOCAL") return "Not sent yet. It will send when you're online.";
  if (l.status === "PENDING") return "Waiting for approval: customers can't see it yet.";
  return null;
}
