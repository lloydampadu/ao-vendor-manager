/**
 * Every failure from the API client is an ApiError so callers can branch on
 * `status` without duck-typing. `status === 0` means we never got a response
 * (offline, DNS, timeout) — those are retryable; 4xx are not.
 *
 * Lives in its own module (no Expo imports) so sync policy and tests can use
 * it without pulling in native modules.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** True when the request never reached the server (no network / timeout). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** True for errors that will not succeed on retry with the same payload. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Human-readable message for an unknown thrown value, safe to show in an Alert. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(err)) {
    if (err.isNetworkError) return "No connection. Check your internet and try again.";
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Pulls a readable message out of an API error body (plain string or zod flatten()). */
export function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const raw = b.error ?? b.message;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") {
      const z = raw as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      const first = z.formErrors?.[0] ?? Object.values(z.fieldErrors ?? {}).flat()[0];
      if (first) return first;
    }
  }
  return `Request failed (HTTP ${status})`;
}

/**
 * Decides what the sync loop does with a failed queue item.
 *  - "drop": the server will never accept it (gone, already actioned, bad
 *    payload) — mark synced with an error note so the UI can show "failed".
 *  - "retry": transient (offline, 5xx) — leave unsynced for the next tick.
 */
export function failureAction(err: unknown): "drop" | "retry" {
  if (err instanceof SyntaxError) return "drop";
  if (!isApiError(err)) return "retry";
  if (err.status === 400 || err.status === 404 || err.status === 409 || err.status === 422) return "drop";
  return "retry";
}
