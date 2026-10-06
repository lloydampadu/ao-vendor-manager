import { effectiveStatus, INBOX_SEGMENTS, parseJson, STATUS_LABEL } from "@/lib/assignment-status";

describe("effectiveStatus", () => {
  it("maps a plain pending assignment", () => {
    expect(effectiveStatus("PENDING", null)).toBe("PENDING");
  });

  it("derives WON from the quote outcome, not the assignment status", () => {
    // The server never changes the assignment away from QUOTED when the
    // customer picks a vendor — the outcome lives on the quote.
    expect(effectiveStatus("QUOTED", { status: "SELECTED" })).toBe("WON");
    expect(effectiveStatus("QUOTED", { status: "REJECTED" })).toBe("LOST");
    expect(effectiveStatus("QUOTED", { status: "PENDING" })).toBe("QUOTED");
    expect(effectiveStatus("QUOTED", null)).toBe("QUOTED");
  });

  it("passes through closed states", () => {
    expect(effectiveStatus("DECLINED", null)).toBe("DECLINED");
    expect(effectiveStatus("EXPIRED", { status: "SELECTED" })).toBe("EXPIRED");
  });

  it("treats unknown server values as closed instead of crashing", () => {
    expect(effectiveStatus("SOMETHING_NEW", null)).toBe("EXPIRED");
  });

  it("has a label and a segment for every status", () => {
    const all = ["PENDING", "QUOTED", "WON", "LOST", "DECLINED", "EXPIRED"] as const;
    for (const s of all) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(INBOX_SEGMENTS.some((seg) => (seg.statuses as readonly string[]).includes(s))).toBe(true);
    }
  });
});

describe("parseJson", () => {
  it("returns the fallback for null, empty and malformed input", () => {
    expect(parseJson(null, [])).toEqual([]);
    expect(parseJson("", { a: 1 })).toEqual({ a: 1 });
    expect(parseJson("{not json", 0)).toBe(0);
  });

  it("parses valid JSON", () => {
    expect(parseJson('{"x":1}', null)).toEqual({ x: 1 });
  });
});
