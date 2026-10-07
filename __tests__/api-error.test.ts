import { ApiError, errorMessage, extractMessage, failureAction } from "@/lib/api-error";

describe("ApiError", () => {
  it("flags network failures as retryable and 4xx as permanent", () => {
    expect(new ApiError("timeout", 0).isNetworkError).toBe(true);
    expect(new ApiError("timeout", 0).isPermanent).toBe(false);
    expect(new ApiError("gone", 404).isPermanent).toBe(true);
    expect(new ApiError("rate", 429).isPermanent).toBe(false);
    expect(new ApiError("boom", 500).isPermanent).toBe(false);
  });
});

describe("failureAction", () => {
  it("drops items the server will never accept", () => {
    expect(failureAction(new ApiError("already quoted", 409))).toBe("drop");
    expect(failureAction(new ApiError("not found", 404))).toBe("drop");
    expect(failureAction(new ApiError("bad body", 400))).toBe("drop");
    expect(failureAction(new SyntaxError("Unexpected token"))).toBe("drop");
    expect(failureAction(new ApiError("not approved", 403, { code: "NOT_APPROVED" }))).toBe("drop");
  });

  it("retries transient failures", () => {
    expect(failureAction(new ApiError("offline", 0))).toBe("retry");
    expect(failureAction(new ApiError("deploying", 502))).toBe("retry");
    expect(failureAction(new Error("sqlite busy"))).toBe("retry");
    expect(failureAction(new ApiError("forbidden", 403))).toBe("retry");
  });
});

describe("extractMessage", () => {
  it("reads a plain error string", () => {
    expect(extractMessage({ error: "Phone not registered as a vendor" }, 404)).toBe("Phone not registered as a vendor");
  });

  it("reads the first message from a zod flatten() payload", () => {
    expect(extractMessage({ error: { formErrors: [], fieldErrors: { priceGhs: ["Expected number"] } } }, 400)).toBe("Expected number");
  });

  it("falls back to the status code", () => {
    expect(extractMessage("<html>", 502)).toBe("Request failed (HTTP 502)");
    expect(extractMessage(null, 500)).toBe("Request failed (HTTP 500)");
  });
});

describe("errorMessage", () => {
  it("gives a connectivity message for network errors", () => {
    expect(errorMessage(new ApiError("Network request failed", 0))).toMatch(/No connection/);
  });
  it("uses the server message for API errors and the fallback otherwise", () => {
    expect(errorMessage(new ApiError("Already quoted", 409))).toBe("Already quoted");
    expect(errorMessage("weird", "Fallback")).toBe("Fallback");
  });
});
