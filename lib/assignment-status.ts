// Pure helpers for turning the server's two-level state (assignment status +
// quote status) into one vendor-facing status. Kept free of React / Expo
// imports so it is unit-testable in Node.

/** Server `AssignmentStatus` enum. */
export type AssignmentStatus = "PENDING" | "QUOTED" | "DECLINED" | "EXPIRED";

/** Server `QuoteStatus` enum. */
export type QuoteStatus = "PENDING" | "SELECTED" | "REJECTED";

/**
 * What the vendor sees. "WON" / "LOST" are derived from the quote outcome —
 * the assignment itself stays QUOTED on the server after the customer picks.
 */
export type EffectiveStatus = "PENDING" | "QUOTED" | "WON" | "LOST" | "DECLINED" | "EXPIRED";

export function effectiveStatus(
  assignmentStatus: string,
  quote: { status?: string } | null | undefined,
): EffectiveStatus {
  if (assignmentStatus === "QUOTED") {
    if (quote?.status === "SELECTED") return "WON";
    if (quote?.status === "REJECTED") return "LOST";
    return "QUOTED";
  }
  if (assignmentStatus === "DECLINED" || assignmentStatus === "EXPIRED" || assignmentStatus === "PENDING") {
    return assignmentStatus;
  }
  // Unknown value from a newer server — treat as closed rather than crashing.
  return "EXPIRED";
}

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  PENDING: "New",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Not picked",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

/** Inbox segments and which effective statuses each one shows. */
export const INBOX_SEGMENTS = [
  { key: "new", label: "New", statuses: ["PENDING"] as EffectiveStatus[] },
  { key: "quoted", label: "Quoted", statuses: ["QUOTED", "WON", "LOST"] as EffectiveStatus[] },
  { key: "closed", label: "Closed", statuses: ["DECLINED", "EXPIRED"] as EffectiveStatus[] },
] as const;

export type InboxSegmentKey = (typeof INBOX_SEGMENTS)[number]["key"];

/** Safe JSON parse for the blobs we store in SQLite — never throws in render. */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
