import { buildPartName } from "@/lib/part-tiles";
import { normaliseGhanaPhone } from "@/lib/phone";

describe("buildPartName", () => {
  it("joins only the fields that are present", () => {
    expect(buildPartName({ type: "Fender", side: "Left", position: "Front", make: "Toyota", model: "Corolla", year: "2015" }))
      .toBe("Fender — Left — Front — Toyota Corolla 2015");
    expect(buildPartName({ type: " Alternator " })).toBe("Alternator");
    expect(buildPartName({ type: "Engine", make: "Honda", engine: "1.8L" })).toBe("Engine — Honda — 1.8L");
  });
});

describe("normaliseGhanaPhone", () => {
  it("accepts local and international formats", () => {
    expect(normaliseGhanaPhone("0244123456")).toBe("0244123456");
    expect(normaliseGhanaPhone("024 412 3456")).toBe("0244123456");
    expect(normaliseGhanaPhone("+233 24 412 3456")).toBe("0244123456");
  });
  it("rejects anything else", () => {
    expect(normaliseGhanaPhone("244123456")).toBeNull();
    expect(normaliseGhanaPhone("02441234567")).toBeNull();
    expect(normaliseGhanaPhone("")).toBeNull();
  });
});
