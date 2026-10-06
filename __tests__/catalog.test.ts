import { isLightVendor, isTyreVendor, normaliseVendorCategory } from "@/lib/parts-catalog";
import { buildPartName, TILES, visibleTilesFor } from "@/lib/part-tiles";
import { normaliseGhanaPhone } from "@/lib/phone";

describe("vendor kind detection", () => {
  it("recognises tyre vendors by the marker specialty or category", () => {
    expect(isTyreVendor(["Tyres"], [])).toBe(true);
    expect(isTyreVendor([], ["Tyres"])).toBe(true);
    expect(isTyreVendor(["Headlight Bulb"], ["LAMPS"])).toBe(false);
  });

  it("recognises light vendors when every specialty is a lamp part", () => {
    expect(isLightVendor(["Headlight Bulb", "Tail Light"], [])).toBe(true);
    expect(isLightVendor(["Headlight Bulb", "Alternator"], [])).toBe(false);
    expect(isLightVendor([], [])).toBe(false);
  });

  it("maps legacy vendor categories onto current ones", () => {
    expect(normaliseVendorCategory("ENGINE_PARTS")).toBe("ENGINE");
    expect(normaliseVendorCategory("SUSPENSION")).toBe("STEERING_SUSPENSION");
    expect(normaliseVendorCategory("GLASS")).toBe("GLASS");
  });
});

describe("visibleTilesFor", () => {
  it("shows everything to general vendors", () => {
    expect(visibleTilesFor([], [])).toHaveLength(TILES.length);
    expect(visibleTilesFor(["GENERAL"], [])).toHaveLength(TILES.length);
  });

  it("filters by routing category, including legacy enum values", () => {
    const labels = visibleTilesFor(["ENGINE_PARTS"], []).map((t) => t.label);
    expect(labels).toEqual(["Engine"]);
  });

  it("unlocks tiles from specialties", () => {
    const labels = visibleTilesFor(["BODY"], ["Alternator", "Tyres"]).map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(["Body", "Electrical", "Tyres"]));
    expect(labels).not.toContain("Glass");
  });
});

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
