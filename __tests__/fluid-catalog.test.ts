import { fluidListingTitle, fluidNote, kindOf, linesFor, pickProblem, type FluidPick } from "@/lib/fluid-catalog";
import type { ApiFluidCatalog } from "@/lib/api";

const catalog: ApiFluidCatalog = {
  kinds: [
    { id: "k-oil", slug: "engine-oil", name: "Engine oil", grades: ["5W-30", "5W-40"], gradeRequired: true, coolant: false },
    { id: "k-cool", slug: "coolant", name: "Coolant / antifreeze", grades: [], gradeRequired: false, coolant: true },
  ],
  brands: [{ id: "b-total", name: "Total" }],
  lines: [{ kindId: "k-oil", brandId: "b-total", name: "Quartz 9000" }, { kindId: "k-oil", brandId: "b-total", name: "Quartz 7000" }],
  sizes: [{ label: "1 L", ml: 1000 }, { label: "4 L", ml: 4000 }],
  coolantColours: [{ value: "red", label: "Red / pink" }],
  coolantMixes: [{ value: "ready-mixed", label: "Ready-mixed" }],
};
const pick: FluidPick = { kindId: "k-oil", brandId: "b-total", brandName: "", product: "Quartz 9000", grade: "5W-40", colour: "", mix: "", size: "4 L", genuine: true };

describe("fluidNote order", () => {
  it("shows the price check before waiting for approval, and hidden before both", () => {
    expect(fluidNote({ status: "PENDING", review_status: "PRICE_CHECK" })).toBe("We're checking this price. Customers see it once it's cleared.");
    expect(fluidNote({ status: "LOCAL", review_status: "PRICE_CHECK" })).toBe("We're checking this price. Customers see it once it's cleared.");
    expect(fluidNote({ status: "PENDING", review_status: "PRICE_CHECK", hidden: 1, hidden_reason: "x" })).toBe("Hidden by AbosseyOkai Direct: x");
  });
});

describe("fluid catalog helpers", () => {
  it("lists a brand's product lines for a kind, A to Z", () => {
    expect(linesFor(catalog, "k-oil", "b-total")).toEqual(["Quartz 7000", "Quartz 9000"]);
    expect(linesFor(catalog, "k-oil", null)).toEqual([]);
    expect(kindOf(catalog, "k-cool")?.coolant).toBe(true);
  });
  it("checks a pick the way the server does, before it is queued", () => {
    expect(pickProblem(catalog, pick)).toBeNull();
    expect(pickProblem(catalog, { ...pick, genuine: false })).toBe('Tick "This is genuine Total" to list it.');
    expect(pickProblem(catalog, { ...pick, grade: "" })).toBe("Choose the grade.");
    expect(pickProblem(catalog, { ...pick, brandId: null, brandName: "F" })).toBe("Choose the brand, or type it in full.");
    expect(pickProblem(catalog, { ...pick, size: "" })).toBe("Choose the size.");
    expect(pickProblem(catalog, { ...pick, kindId: "k-cool", grade: "", colour: "red", mix: "" })).toBe("Choose the coolant colour and mix.");
  });
  it("builds the same title customers see, and the vendor's status note", () => {
    expect(fluidListingTitle({ brand: "Total", product: "Quartz 9000", grade: "5W-40", coolant_colour: "", coolant_mix: "", size_label: "4 L" })).toBe("Total Quartz 9000 · 5W-40 · 4 L");
    expect(fluidListingTitle({ brand: "Prestone", product: "Antifreeze", grade: "", coolant_colour: "red", coolant_mix: "ready-mixed", size_label: "1 gal" }, catalog))
      .toBe("Prestone Antifreeze · Red / pink · Ready-mixed · 1 gal");
    expect(fluidNote({ status: "PENDING", review_status: "OK" })).toBe("Waiting for approval: customers can't see it yet.");
    expect(fluidNote({ status: "APPROVED", review_status: "PRICE_CHECK" })).toBe("We're checking this price. Customers see it once it's cleared.");
    expect(fluidNote({ status: "APPROVED", review_status: "OK" })).toBeNull();
    expect(fluidNote({ status: "APPROVED", review_status: "OK", hidden: 1, hidden_reason: "Not genuine" })).toBe("Hidden by AbosseyOkai Direct: Not genuine");
    expect(fluidNote({ status: "APPROVED", review_status: "OK", hidden: 1, hidden_reason: null })).toBe("Hidden by AbosseyOkai Direct.");
    expect(fluidNote({ status: "REJECTED", review_status: "OK", hidden: 1, hidden_reason: "x", rejected_reason: "Choose a grade from the list." })).toBe("Not saved: Choose a grade from the list.");
  });
});
